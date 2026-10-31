// @vitest-environment node
import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "~/server/db";
import { getPublicProfileActivity } from "~/server/loaders/publicProfiles";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import {
  getBadgesForOfficer,
  getOwnBadges,
  getPublicBadges,
} from "~/server/loaders/badges";
import { removeAttendance } from "~/server/attendance/officerAttendance";

/**
 * Badges against a real database: the automatic awards the triggers write in
 * the evidence's own transaction (Workshop completed, First Commit), their
 * withdrawal when the evidence goes, officer-awarded badges and who may award
 * them, the member hiding a badge, and what account deletion does (a member's
 * awards go; a badge a deleted officer awarded stays, with no awarder).
 * Fixture ids are all `d2...` and swept before and after every test.
 */

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { awardManualBadge, setBadgeHidden, withdrawBadge } =
  await import("~/server/badges/manual");
const { saveReflection } = await import("~/server/actions/reflections");

const id = (n: number) =>
  `d2000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const MEMBER = id(1);
const OFFICER = id(2);
const OTHER = id(3);
const ALL = [MEMBER, OFFICER, OTHER] as const;
const MEETING_A = id(11);
const MEETING_B = id(12);
const MEETING_SOLO = id(13);
const ROLE = id(21);
const REPO_ID = "920000001";
const WS_A = "d2-ws-a";
const WS_B = "d2-ws-b";
const WS_SOLO = "d2-ws-solo";

async function cleanup() {
  const ids = sql.join(
    ALL.map((u) => sql`${u}::uuid`),
    sql`, `,
  );
  const meetings = sql`${MEETING_A}::uuid, ${MEETING_B}::uuid, ${MEETING_SOLO}::uuid`;
  // One transaction with triggers off: a live sweep would fire the badge
  // triggers and write fresh withdrawal audits after they were deleted. Rows
  // are found by meeting too, because account deletion nulls attendance's
  // "userId".
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."reflectionRevisions"
      where "userId" in (${ids}) or "meetingId" in (${meetings})
    `);
    await tx.execute(sql`
      delete from platform.reflections
      where "userId" in (${ids}) or "meetingId" in (${meetings})
    `);
    await tx.execute(sql`
      delete from platform.attendance
      where "userId" in (${ids}) or "meetingId" in (${meetings})
    `);
    await tx.execute(
      sql`delete from platform."badgeAwards" where "userId" in (${ids})`,
    );
    await tx.execute(
      sql`delete from platform.workshops where "meetingId" in (${meetings})`,
    );
    await tx.execute(
      sql`delete from platform.meetings where id in (${meetings})`,
    );
    // The awards that pointed at a commit are gone, so the commit can go,
    // and then the repository it was stored under.
    await tx.execute(
      sql`delete from platform."repoCommits" where "githubRepoId" = ${REPO_ID}::bigint`,
    );
    await tx.execute(
      sql`delete from platform.commits where "githubRepoId" = ${REPO_ID}::bigint`,
    );
    await tx.execute(
      sql`delete from platform."githubRepos" where "githubRepoId" = ${REPO_ID}::bigint`,
    );
    await tx.execute(sql`
      delete from platform."auditEvents"
      where ("targetType" = 'badgeAward'
             and metadata->>'userId' in (${sql.join(
               ALL.map((u) => sql`${u}`),
               sql`, `,
             )}))
         or "actorUserId" in (${ids})
    `);
  });
  await db.execute(sql`delete from platform.roles where id = ${ROLE}::uuid`);
  await deleteMembers(ALL);
}

beforeAll(cleanup);
afterAll(cleanup);

beforeEach(async () => {
  await cleanup();
  await insertMember({ id: MEMBER, handle: "badges-member", github: null });
  await insertMember({ id: OFFICER, handle: "badges-officer" });
  await insertMember({ id: OTHER, handle: "badges-other" });
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "isLeadership")
    values (${ROLE}::uuid, 'D2 Test Officer', 9999.25, true)
  `);
  await db.execute(sql`
    insert into platform."userRoles" ("userId", "roleId")
    values (${OFFICER}::uuid, ${ROLE}::uuid)
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt")
    values
      (${MEETING_A}::uuid, 'd2-badges-a', now() - interval '3 days', now() - interval '3 days' + interval '2 hours'),
      (${MEETING_B}::uuid, 'd2-badges-b', now() - interval '2 days', now() - interval '2 days' + interval '2 hours'),
      (${MEETING_SOLO}::uuid, 'd2-badges-solo', now() - interval '1 days', now() - interval '1 days' + interval '2 hours')
  `);
  await db.execute(sql`
    insert into platform.workshops ("meetingId", "definitionId")
    values (${MEETING_A}::uuid, ${WS_A}), (${MEETING_A}::uuid, ${WS_B}),
           (${MEETING_B}::uuid, ${WS_A}), (${MEETING_SOLO}::uuid, ${WS_SOLO})
  `);
});

async function attend(userId: string, meetingId: string) {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt")
    values (gen_random_uuid(), ${userId}::uuid, ${meetingId}::uuid, 'qr', now())
    returning id
  `);
  return row!.id;
}

async function reflect(
  userId: string,
  meetingId: string,
  workshop: string | null,
  submitted: boolean,
) {
  await db.execute(sql`
    insert into platform.reflections ("userId", "meetingId", content, "submittedAt", "workshopDefinitionId")
    values (${userId}::uuid, ${meetingId}::uuid, 'words',
            ${submitted ? sql`now()` : sql`null`}, ${workshop})
    on conflict ("userId", "meetingId") where "meetingId" is not null
    do update set "submittedAt" = excluded."submittedAt",
                  "workshopDefinitionId" = excluded."workshopDefinitionId"
  `);
}

type AwardRecord = {
  badgeId: string;
  workshopDefinitionId: string | null;
  meetingId: string | null;
  withdrawnAt: Date | null;
  withdrawnReason: string | null;
  awardedBy: string | null;
  method: string;
};

async function awards(userId: string, badgeId?: string) {
  return db.execute<AwardRecord>(sql`
    select "badgeId", "workshopDefinitionId", "meetingId", "withdrawnAt",
           "withdrawnReason", "awardedBy", method
    from platform."badgeAwards"
    where "userId" = ${userId}::uuid
      and (${badgeId ?? null}::text is null or "badgeId" = ${badgeId ?? null})
    order by "awardedAt", id
  `);
}

async function audit(action: string, userId: string) {
  return db.execute<{ action: string; actorType: string }>(sql`
    select action, "actorType" from platform."auditEvents"
    where action = ${action} and "targetType" = 'badgeAward'
      and metadata->>'userId' = ${userId}
  `);
}

describe("Workshop completed (Q93, Q96)", () => {
  it("is awarded once attendance and a submitted reflection naming the workshop exist", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    const rows = await awards(MEMBER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      badgeId: "workshop-completed",
      workshopDefinitionId: WS_A,
      meetingId: MEETING_A,
      method: "automatic",
      awardedBy: null,
      withdrawnAt: null,
    });
    expect(await audit("badge.awarded", MEMBER)).toHaveLength(1);
  });

  it("is not awarded for a draft, for another workshop, or for no pick", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, false);
    expect(await awards(MEMBER)).toHaveLength(0);
    await reflect(MEMBER, MEETING_A, null, true);
    expect(await awards(MEMBER)).toHaveLength(0);
    // The meeting never ran this workshop.
    await reflect(MEMBER, MEETING_A, WS_SOLO, true);
    expect(await awards(MEMBER)).toHaveLength(0);
  });

  it("is not awarded without attendance", async () => {
    await reflect(MEMBER, MEETING_A, WS_A, true);
    expect(await awards(MEMBER)).toHaveLength(0);
  });

  it("is awarded when the attendance arrives after the reflection", async () => {
    await reflect(MEMBER, MEETING_A, WS_A, true);
    await attend(MEMBER, MEETING_A);
    expect(await awards(MEMBER)).toHaveLength(1);
  });

  it("is idempotent: resubmitting, or a second night of the same workshop, adds nothing", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    await db.execute(
      sql`update platform.reflections set content = 'more words' where "userId" = ${MEMBER}::uuid`,
    );
    await attend(MEMBER, MEETING_B);
    await reflect(MEMBER, MEETING_B, WS_A, true);
    expect(await awards(MEMBER)).toHaveLength(1);
    expect(await audit("badge.awarded", MEMBER)).toHaveLength(1);
  });

  it("is one badge per workshop: a different workshop is a second badge", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    await attend(MEMBER, MEETING_SOLO);
    await reflect(MEMBER, MEETING_SOLO, WS_SOLO, true);
    expect(
      (await awards(MEMBER)).map((r) => r.workshopDefinitionId).sort(),
    ).toEqual([WS_A, WS_SOLO]);
  });

  it("is withdrawn, audited, when an officer removes the supporting attendance (Q99)", async () => {
    const attendanceId = await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    const result = await removeAttendance(
      OFFICER,
      MEETING_A,
      attendanceId,
      "wrong person",
    );
    expect(result.status).toBe("removed");
    const [row] = await awards(MEMBER);
    expect(row?.withdrawnAt).not.toBeNull();
    expect(row?.withdrawnReason).toMatch(/no longer exists/);
    expect(await audit("badge.withdrawn", MEMBER)).toEqual([
      { action: "badge.withdrawn", actorType: "system" },
    ]);
    // Public view no longer lists it.
    expect(await getPublicBadges(MEMBER)).toEqual([]);
  });

  it("is withdrawn when the reflection is deleted, and earned again when it returns", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    await db.execute(
      sql`delete from platform.reflections where "userId" = ${MEMBER}::uuid`,
    );
    expect((await awards(MEMBER))[0]?.withdrawnAt).not.toBeNull();
    await reflect(MEMBER, MEETING_A, WS_A, true);
    const rows = await awards(MEMBER);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.withdrawnAt === null)).toHaveLength(1);
  });

  it("survives losing one night when another still supports it", async () => {
    const first = await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    await attend(MEMBER, MEETING_B);
    await reflect(MEMBER, MEETING_B, WS_A, true);
    await removeAttendance(OFFICER, MEETING_A, first, null);
    const [row] = await awards(MEMBER);
    expect(row?.withdrawnAt).toBeNull();
    expect(row?.meetingId).toBe(MEETING_B);
  });
});

describe("Workshop completed follows its evidence (review of #231)", () => {
  async function liveAwardId(userId: string) {
    const [row] = await db.execute<{ id: string }>(sql`
      select id from platform."badgeAwards"
      where "userId" = ${userId}::uuid and "withdrawnAt" is null`);
    return row?.id;
  }

  it("stays withdrawn after an officer withdraws it, whatever evidence comes later", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    const awardId = await liveAwardId(MEMBER);
    expect(
      (await withdrawBadge(OFFICER, awardId!, "Signed in for a friend."))
        .status,
    ).toBe("withdrawn");

    await reflect(MEMBER, MEETING_A, WS_A, true);
    await attend(MEMBER, MEETING_B);
    await reflect(MEMBER, MEETING_B, WS_A, true);

    const rows = await awards(MEMBER);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.withdrawnReason).toBe("Signed in for a friend.");
    expect(await audit("badge.awarded", MEMBER)).toHaveLength(1);
  });

  it("is withdrawn when its meeting is cancelled, and earned again when it is restored", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);

    await db.execute(
      sql`update platform.meetings set "cancelledAt" = now() where id = ${MEETING_A}::uuid`,
    );
    expect(await liveAwardId(MEMBER)).toBeUndefined();
    expect(await getPublicBadges(MEMBER)).toEqual([]);

    await db.execute(
      sql`update platform.meetings set "cancelledAt" = null where id = ${MEETING_A}::uuid`,
    );
    expect(await liveAwardId(MEMBER)).toBeDefined();
  });

  it("is withdrawn when its meeting is deleted, or the workshop leaves the meeting", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    await attend(OTHER, MEETING_SOLO);
    await reflect(OTHER, MEETING_SOLO, WS_SOLO, true);

    await db.execute(
      sql`update platform.meetings set "deletedAt" = now() where id = ${MEETING_A}::uuid`,
    );
    expect(await liveAwardId(MEMBER)).toBeUndefined();

    await db.execute(
      sql`update platform.workshops set "deletedAt" = now()
          where "meetingId" = ${MEETING_SOLO}::uuid`,
    );
    expect(await liveAwardId(OTHER)).toBeUndefined();
  });

  it("syncs once, on where a transaction ends up", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);

    // A reconcile that cancels and restores in one go leaves the award alone.
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`update platform.meetings set "cancelledAt" = now() where id = ${MEETING_A}::uuid`,
      );
      await tx.execute(
        sql`update platform.meetings set "cancelledAt" = null where id = ${MEETING_A}::uuid`,
      );
    });
    expect(await awards(MEMBER)).toHaveLength(1);
    expect(await audit("badge.withdrawn", MEMBER)).toHaveLength(0);
  });
});

describe("the reflection workshop picker (Q95, Q98)", () => {
  function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    return data;
  }
  const words = Array.from({ length: 120 }, () => "word").join(" ");

  it("needs a workshop to submit a meeting that ran several, and awards on submit", async () => {
    session.userId = MEMBER;
    await attend(MEMBER, MEETING_A);
    const base = {
      activityType: "meeting",
      activityId: MEETING_A,
      content: words,
      intent: "submit",
    };
    const missing = await saveReflection(
      { ok: false, message: "" },
      form(base),
    );
    expect(missing).toEqual({
      ok: false,
      message: "Choose the workshop you attended.",
    });
    const wrong = await saveReflection(
      { ok: false, message: "" },
      form({ ...base, workshopDefinitionId: WS_SOLO }),
    );
    expect(wrong.message).toBe("That workshop did not run at this meeting.");
    expect(await awards(MEMBER)).toHaveLength(0);

    const ok = await saveReflection(
      { ok: false, message: "" },
      form({ ...base, workshopDefinitionId: WS_B }),
    );
    expect(ok.ok).toBe(true);
    const [row] = await awards(MEMBER);
    expect(row?.workshopDefinitionId).toBe(WS_B);
  });

  it("defaults to the only workshop a meeting ran, and a draft awards nothing", async () => {
    session.userId = MEMBER;
    await attend(MEMBER, MEETING_SOLO);
    const draft = await saveReflection(
      { ok: false, message: "" },
      form({
        activityType: "meeting",
        activityId: MEETING_SOLO,
        content: "short",
        intent: "save",
      }),
    );
    expect(draft.ok).toBe(true);
    expect(await awards(MEMBER)).toHaveLength(0);
    const submit = await saveReflection(
      { ok: false, message: "" },
      form({
        activityType: "meeting",
        activityId: MEETING_SOLO,
        content: words,
        intent: "submit",
      }),
    );
    expect(submit.ok).toBe(true);
    expect((await awards(MEMBER))[0]?.workshopDefinitionId).toBe(WS_SOLO);
  });
});

const SHA = (n: number) => `d2${String(n).padStart(2, "0")}${"0".repeat(36)}`;

/**
 * Stores one commit the way the sync does: the commit row first, then its
 * default-branch provenance. `provenance: false` stops after the first write.
 */
async function storeCommit(
  n: number,
  options: { userId?: string; committedAt?: string; provenance?: boolean } = {},
) {
  const userId = options.userId ?? MEMBER;
  const committedAt = options.committedAt ?? "2026-10-14T15:00:00Z";
  await db.execute(sql`
    insert into platform."githubRepos"
      ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch")
    values (${REPO_ID}::bigint, 920, 'DevDogsUGA', 'badges-dbtest', 'Organization', 'main')
    on conflict do nothing
  `);
  await db.execute(sql`
    insert into platform.commits
      (sha, "githubRepoId", "authorGithubId", "authorLogin", "userId", "committedAt", message)
    values (${SHA(n)}, ${REPO_ID}::bigint, 9200000001, 'badges-a', ${userId}::uuid,
            ${committedAt}::timestamptz, ${`commit ${n}`})
  `);
  if (options.provenance === false) return;
  await db.execute(sql`
    insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch")
    values (${REPO_ID}::bigint, ${SHA(n)}, 'main')
  `);
}

async function awardedSha(userId: string) {
  const [row] = await db.execute<{ sha: string | null }>(sql`
    select "commitSha" as sha from platform."badgeAwards"
    where "userId" = ${userId}::uuid and "badgeId" = 'first-commit'
  `);
  return row?.sha;
}

describe("First Commit (Q42, Q46)", () => {
  it("is awarded when a member's first commit is stored", async () => {
    await storeCommit(1);
    const rows = await awards(MEMBER, "first-commit");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: "automatic", awardedBy: null });
    expect(await awardedSha(MEMBER)).toBe(SHA(1));
    expect(await audit("badge.awarded", MEMBER)).toHaveLength(1);
  });

  it("waits for the commit's default-branch provenance", async () => {
    await storeCommit(1, { provenance: false });
    expect(await awards(MEMBER)).toHaveLength(0);
    await db.execute(sql`
      insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch")
      values (${REPO_ID}::bigint, ${SHA(1)}, 'main')
    `);
    expect(await awards(MEMBER, "first-commit")).toHaveLength(1);
  });

  it("is awarded once: later commits add nothing, and a withdrawn one stays withdrawn", async () => {
    await storeCommit(1);
    await storeCommit(2, { committedAt: "2026-10-15T15:00:00Z" });
    expect(await awards(MEMBER, "first-commit")).toHaveLength(1);

    const [award] = await db.execute<{ id: string }>(
      sql`select id from platform."badgeAwards" where "userId" = ${MEMBER}::uuid`,
    );
    expect(
      (await withdrawBadge(OFFICER, award!.id, "recorded in error")).status,
    ).toBe("withdrawn");
    await storeCommit(3, { committedAt: "2026-10-16T15:00:00Z" });
    const rows = await awards(MEMBER, "first-commit");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.withdrawnAt).not.toBeNull();
    expect(await audit("badge.awarded", MEMBER)).toHaveLength(1);
  });

  it("is idempotent when the function runs again", async () => {
    await storeCommit(1);
    await db.execute(sql`select platform.award_first_commit(${MEMBER}::uuid)`);
    await db.execute(sql`select platform.award_first_commit(${MEMBER}::uuid)`);
    expect(await awards(MEMBER, "first-commit")).toHaveLength(1);
    expect(await audit("badge.awarded", MEMBER)).toHaveLength(1);
  });

  it("points at the earliest commit, and a backfilled older one only moves the pointer", async () => {
    await storeCommit(5, { committedAt: "2026-10-20T00:00:00Z" });
    expect(await awardedSha(MEMBER)).toBe(SHA(5));
    await storeCommit(4, { committedAt: "2026-10-01T00:00:00Z" });
    expect(await awards(MEMBER, "first-commit")).toHaveLength(1);
    expect(await awardedSha(MEMBER)).toBe(SHA(4));
  });

  it("awards each member for their own commit only", async () => {
    await storeCommit(1, { userId: OTHER });
    expect(await awards(MEMBER)).toHaveLength(0);
    expect(await awards(OTHER, "first-commit")).toHaveLength(1);
  });
});

describe("manual awards (Q104, Q106, Q107)", () => {
  const input = (overrides = {}) => ({
    userId: MEMBER,
    badgeId: "mentor",
    citation: "Walked a teammate through their first PR.",
    ...overrides,
  });

  it("lets an officer award, with the citation and an audit event", async () => {
    const result = await awardManualBadge(OFFICER, input());
    expect(result.status).toBe("awarded");
    const [row] = await awards(MEMBER, "mentor");
    expect(row).toMatchObject({ method: "manual", awardedBy: OFFICER });
    const events = await audit("badge.awarded", MEMBER);
    expect(events).toEqual([{ action: "badge.awarded", actorType: "user" }]);
  });

  it("refuses a member who is not an officer", async () => {
    expect((await awardManualBadge(OTHER, input())).status).toBe("forbidden");
    expect((await awardManualBadge(MEMBER, input())).status).toBe("forbidden");
    expect(await awards(MEMBER)).toHaveLength(0);
  });

  it("refuses withdrawal by a non-officer", async () => {
    const result = await awardManualBadge(OFFICER, input());
    if (result.status !== "awarded") throw new Error("not awarded");
    expect((await withdrawBadge(OTHER, result.awardId, "no")).status).toBe(
      "forbidden",
    );
    expect((await awards(MEMBER))[0]?.withdrawnAt).toBeNull();
  });

  it("requires a citation, a manual badge, a real member, and not yourself", async () => {
    expect(
      (await awardManualBadge(OFFICER, input({ citation: "  " }))).status,
    ).toBe("citation_required");
    expect(
      (await awardManualBadge(OFFICER, input({ citation: "x".repeat(281) })))
        .status,
    ).toBe("citation_too_long");
    expect(
      (await awardManualBadge(OFFICER, input({ badgeId: "first-commit" })))
        .status,
    ).toBe("unknown_badge");
    expect(
      (
        await awardManualBadge(
          OFFICER,
          input({ badgeId: "workshop-completed" }),
        )
      ).status,
    ).toBe("unknown_badge");
    expect(
      (await awardManualBadge(OFFICER, input({ userId: id(99) }))).status,
    ).toBe("unknown_member");
    expect(
      (await awardManualBadge(OFFICER, input({ userId: OFFICER }))).status,
    ).toBe("self_award");
    expect(await awards(MEMBER)).toHaveLength(0);
  });

  it("allows several dated awards of an officer badge, shown as a multiplier", async () => {
    await awardManualBadge(
      OFFICER,
      input({ citation: "First workshop hosted." }),
    );
    await awardManualBadge(
      OFFICER,
      input({ citation: "Second workshop hosted." }),
    );
    expect(await awards(MEMBER, "mentor")).toHaveLength(2);
    const [entry] = await getPublicBadges(MEMBER);
    expect(entry?.count).toBe(2);
    expect(entry?.awards.map((a) => a.citation)).toEqual([
      "Second workshop hosted.",
      "First workshop hosted.",
    ]);
  });

  it("withdraws with a required reason, audited, keeping the record", async () => {
    const result = await awardManualBadge(OFFICER, input());
    if (result.status !== "awarded") throw new Error("not awarded");
    expect((await withdrawBadge(OFFICER, result.awardId, " ")).status).toBe(
      "reason_required",
    );
    expect(
      (
        await withdrawBadge(
          OFFICER,
          result.awardId,
          "Awarded to the wrong member.",
        )
      ).status,
    ).toBe("withdrawn");
    expect((await withdrawBadge(OFFICER, result.awardId, "again")).status).toBe(
      "not_found",
    );
    const [row] = await awards(MEMBER, "mentor");
    expect(row?.withdrawnReason).toBe("Awarded to the wrong member.");
    expect(await audit("badge.withdrawn", MEMBER)).toHaveLength(1);
    expect(await getPublicBadges(MEMBER)).toEqual([]);
    const forOfficer = await getBadgesForOfficer(MEMBER);
    expect(forOfficer[0]?.awards[0]?.withdrawnAt).not.toBeNull();
  });
});

describe("hiding (Q89, Q107)", () => {
  it("hides the badge and its citation from the public profile but keeps the record", async () => {
    await awardManualBadge(OFFICER, {
      userId: MEMBER,
      badgeId: "mentor",
      citation: "Quietly helpful.",
    });
    expect(await getPublicBadges(MEMBER)).toHaveLength(1);
    expect(await setBadgeHidden(MEMBER, "mentor", null, true)).toBe(1);
    expect(await getPublicBadges(MEMBER)).toEqual([]);
    expect(JSON.stringify(await getPublicBadges(MEMBER))).not.toContain(
      "Quietly helpful",
    );
    const own = await getOwnBadges(MEMBER);
    expect(own[0]?.hidden).toBe(true);
    expect(await awards(MEMBER, "mentor")).toHaveLength(1);
    // Showing it again restores it.
    await setBadgeHidden(MEMBER, "mentor", null, false);
    expect(await getPublicBadges(MEMBER)).toHaveLength(1);
  });

  it("only touches the member's own badges, and a re-award of a hidden badge stays hidden", async () => {
    await awardManualBadge(OFFICER, {
      userId: MEMBER,
      badgeId: "mentor",
      citation: "One.",
    });
    expect(await setBadgeHidden(OTHER, "mentor", null, true)).toBe(0);
    await setBadgeHidden(MEMBER, "mentor", null, true);
    await awardManualBadge(OFFICER, {
      userId: MEMBER,
      badgeId: "mentor",
      citation: "Two.",
    });
    expect(await getPublicBadges(MEMBER)).toEqual([]);
  });

  it("reaches a public profile only through the profile loader", async () => {
    // OTHER is fully verified (MEMBER has no GitHub, so it has no public profile).
    await awardManualBadge(OFFICER, {
      userId: OTHER,
      badgeId: "event-organizer",
      citation: "Ran the fall social.",
    });
    const activity = await getPublicProfileActivity("badges-other");
    expect(activity?.badges.map((b) => b.name)).toEqual(["Event Organizer"]);
    expect(await getPublicProfileActivity("badges-nobody")).toBeNull();
  });
});

describe("account deletion (Q168)", () => {
  it("erases a member's awards with the account, audit events aside", async () => {
    await awardManualBadge(OFFICER, {
      userId: MEMBER,
      badgeId: "mentor",
      citation: "Gone with the account.",
    });
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    expect(await awards(MEMBER)).toHaveLength(2);
    await deleteMembers([MEMBER]);
    expect(await awards(MEMBER)).toHaveLength(0);
  });

  it("keeps a badge a deleted officer awarded, awarded by nobody", async () => {
    await awardManualBadge(OFFICER, {
      userId: MEMBER,
      badgeId: "guide-author",
      citation: "Wrote the Supabase guide.",
    });
    await deleteMembers([OFFICER]);
    const [row] = await awards(MEMBER, "guide-author");
    expect(row?.awardedBy).toBeNull();
    const [entry] = await getPublicBadges(MEMBER);
    expect(entry?.awards[0]?.awardedByLabel).toBe("Deleted member");
    expect(entry?.awards[0]?.citation).toBe("Wrote the Supabase guide.");
  });

  it("does not write badge audit noise while an account is being deleted", async () => {
    await attend(MEMBER, MEETING_A);
    await reflect(MEMBER, MEETING_A, WS_A, true);
    await deleteMembers([MEMBER]);
    expect(await audit("badge.withdrawn", MEMBER)).toHaveLength(0);
  });
});
