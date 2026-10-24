// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import { planBadges } from "../../../../../packages/backstage/src/badges/commands";
import {
  applyBadgesFor,
  readEvidenceFor,
} from "../../../../../packages/backstage/src/badges/store";

/**
 * `backstage import badges` against a real database. Evidence is seeded with
 * the badge triggers off (session_replication_role = replica), as it existed
 * before migration 74; the backfill then runs twice through the same store
 * Backstage uses. Asserts the awards, the skips, that officer awards and
 * withdrawals stand, and idempotency. Fixture ids are all `d6...`.
 */

const id = (n: number) =>
  `d6000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const SOLO_MEMBER = id(1); // null workshop, meeting ran exactly one
const PICKED_MEMBER = id(2); // chose a workshop on a multi-workshop meeting
const AMBIGUOUS_MEMBER = id(3); // null workshop, meeting ran two: skipped
const MANUAL_MEMBER = id(4); // officer-awarded Workshop completed
const MERGER = id(5); // matched contribution
const WITHDRAWN_MERGER = id(6); // First Merge withdrawn by an officer
const NO_ATTENDANCE = id(7); // reflection, never checked in: skipped
const ALL = [
  SOLO_MEMBER,
  PICKED_MEMBER,
  AMBIGUOUS_MEMBER,
  MANUAL_MEMBER,
  MERGER,
  WITHDRAWN_MERGER,
  NO_ATTENDANCE,
] as const;
const MEETING_SOLO = id(11);
const MEETING_MULTI = id(12);
const WS_SOLO = "d6-ws-solo";
const WS_A = "d6-ws-a";
const WS_B = "d6-ws-b";
const REPO = "DevDogsUGA/badge-backfill-dbtest";

const ids = () =>
  sql.join(
    ALL.map((u) => sql`${u}::uuid`),
    sql`, `,
  );

async function cleanup() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(
      sql`delete from platform.contributions where repo = ${REPO}`,
    );
    await tx.execute(
      sql`delete from platform.reflections where "userId" in (${ids()})`,
    );
    await tx.execute(
      sql`delete from platform.attendance where "userId" in (${ids()})`,
    );
    await tx.execute(
      sql`delete from platform."badgeAwards" where "userId" in (${ids()})`,
    );
    await tx.execute(sql`
      delete from platform.workshops
      where "meetingId" in (${MEETING_SOLO}::uuid, ${MEETING_MULTI}::uuid)
    `);
    await tx.execute(sql`
      delete from platform.meetings
      where id in (${MEETING_SOLO}::uuid, ${MEETING_MULTI}::uuid)
    `);
  });
  await deleteMembers(ALL);
}

beforeAll(cleanup);
afterAll(cleanup);

async function seed() {
  await cleanup();
  for (const [i, member] of ALL.entries()) {
    await insertMember({ id: member, handle: `d6-member-${i}`, github: null });
  }
  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt")
    values
      (${MEETING_SOLO}::uuid, 'd6-solo', now() - interval '9 days', now() - interval '9 days' + interval '2 hours'),
      (${MEETING_MULTI}::uuid, 'd6-multi', now() - interval '8 days', now() - interval '8 days' + interval '2 hours')
  `);
  await db.execute(sql`
    insert into platform.workshops ("meetingId", "definitionId")
    values (${MEETING_SOLO}::uuid, ${WS_SOLO}),
           (${MEETING_MULTI}::uuid, ${WS_A}), (${MEETING_MULTI}::uuid, ${WS_B})
  `);

  // Evidence as it existed before the triggers: no awards get written.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    const attend = (user: string, meeting: string) =>
      tx.execute(sql`
      insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt")
      values (gen_random_uuid(), ${user}::uuid, ${meeting}::uuid, 'qr', now())
    `);
    const reflect = (user: string, meeting: string, ws: string | null) =>
      tx.execute(sql`
        insert into platform.reflections ("userId", "meetingId", content, "submittedAt", "workshopDefinitionId")
        values (${user}::uuid, ${meeting}::uuid, 'words', now(), ${ws})
      `);
    await attend(SOLO_MEMBER, MEETING_SOLO);
    await reflect(SOLO_MEMBER, MEETING_SOLO, null);
    await attend(PICKED_MEMBER, MEETING_MULTI);
    await reflect(PICKED_MEMBER, MEETING_MULTI, WS_A);
    await attend(AMBIGUOUS_MEMBER, MEETING_MULTI);
    await reflect(AMBIGUOUS_MEMBER, MEETING_MULTI, null);
    await attend(MANUAL_MEMBER, MEETING_SOLO);
    await reflect(MANUAL_MEMBER, MEETING_SOLO, WS_SOLO);
    await reflect(NO_ATTENDANCE, MEETING_SOLO, WS_SOLO);
    await tx.execute(sql`
      insert into platform."badgeAwards"
        ("userId", "badgeId", "workshopDefinitionId", "method", "repeatable", "citation", "awardedBy")
      values (${MANUAL_MEMBER}::uuid, 'workshop-completed', ${WS_SOLO}, 'manual', false, 'Led it', null)
    `);
    await tx.execute(sql`
      insert into platform.contributions (repo, "prNumber", title, url, "mergedAt", "authorGithubId", "authorLogin", "userId")
      values (${REPO}, 1, 'one', 'https://example.test/1', now() - interval '5 days', '9600000001', 'd6-a', ${MERGER}::uuid),
             (${REPO}, 2, 'two', 'https://example.test/2', now() - interval '4 days', '9600000001', 'd6-a', ${MERGER}::uuid),
             (${REPO}, 3, 'three', 'https://example.test/3', now() - interval '3 days', '9600000002', 'd6-b', ${WITHDRAWN_MERGER}::uuid)
    `);
    await tx.execute(sql`
      insert into platform."badgeAwards"
        ("userId", "badgeId", "method", "repeatable", "withdrawnAt", "withdrawnReason")
      values (${WITHDRAWN_MERGER}::uuid, 'first-merge', 'automatic', false, now(), 'recorded in error')
    `);
  });
}

type Award = {
  userId: string;
  badgeId: string;
  workshopDefinitionId: string | null;
  method: string;
  withdrawnAt: Date | null;
};

async function awards() {
  return db.execute<Award>(sql`
    select "userId", "badgeId", "workshopDefinitionId", method, "withdrawnAt"
    from platform."badgeAwards" where "userId" in (${ids()})
    order by "userId", "badgeId", "workshopDefinitionId"
  `);
}

async function backfillAudits() {
  return db.execute<{ metadata: Record<string, unknown> }>(sql`
    select metadata from platform."auditEvents"
    where action = 'badge.backfill' and "targetType" = 'badgeBackfill'
    order by "createdAt"
  `);
}

describe("import badges (Q105, Q29)", () => {
  it("awards pre-existing evidence, skips the ambiguous, and is idempotent", async () => {
    await seed();
    const read = readEvidenceFor(env.DB_URL);
    const apply = applyBadgesFor(env.DB_URL);
    expect(await awards()).toHaveLength(2); // the manual and the withdrawn row

    const auditsBefore = (await backfillAudits()).length;
    const plan = planBadges(await read());
    const ours = plan.workshop.awards.filter((a) =>
      (ALL as readonly string[]).includes(a.userId),
    );
    expect(ours.map((a) => a.userId).sort()).toEqual(
      [SOLO_MEMBER, PICKED_MEMBER].sort(),
    );
    expect(plan.workshop.skipped["no attendance"]).toBeGreaterThanOrEqual(1);
    expect(
      plan.workshop.skipped[
        "meeting ran several workshops and none was chosen"
      ],
    ).toBeGreaterThanOrEqual(1);

    await apply(plan);

    const rows = (await awards()).map(
      (r) =>
        `${r.userId}|${r.badgeId}|${r.workshopDefinitionId ?? ""}|${r.method}|${r.withdrawnAt ? "withdrawn" : "live"}`,
    );
    expect(rows).toEqual(
      [
        `${SOLO_MEMBER}|workshop-completed|${WS_SOLO}|automatic|live`,
        `${PICKED_MEMBER}|workshop-completed|${WS_A}|automatic|live`,
        `${MANUAL_MEMBER}|workshop-completed|${WS_SOLO}|manual|live`,
        `${MERGER}|first-merge||automatic|live`,
        `${WITHDRAWN_MERGER}|first-merge||automatic|withdrawn`,
      ].sort(),
    );
    // The ambiguous and the never-checked-in members got nothing.
    const holders = new Set((await awards()).map((r) => r.userId));
    expect(holders.has(AMBIGUOUS_MEMBER)).toBe(false);
    expect(holders.has(NO_ATTENDANCE)).toBe(false);

    // The default workshop was recorded on the null reflection.
    const [recorded] = await db.execute<{ workshopDefinitionId: string }>(sql`
      select "workshopDefinitionId" from platform.reflections
      where "userId" = ${SOLO_MEMBER}::uuid
    `);
    expect(recorded?.workshopDefinitionId).toBe(WS_SOLO);

    // One audit summary for the run.
    expect((await backfillAudits()).length).toBe(auditsBefore + 1);

    // A second run changes nothing and plans nothing for these members.
    const again = planBadges(await read());
    expect(
      again.workshop.awards.filter((a) =>
        (ALL as readonly string[]).includes(a.userId),
      ),
    ).toEqual([]);
    expect(
      again.firstMerge.userIds.filter((u) =>
        (ALL as readonly string[]).includes(u),
      ),
    ).toEqual([]);
    const before = await awards();
    await apply(again);
    expect(await awards()).toEqual(before);
  });
});
