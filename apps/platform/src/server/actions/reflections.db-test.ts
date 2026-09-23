// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";

/**
 * `saveReflection` against a real database.
 *
 * The competition cases exercise `eligibleActivity`'s competition branch,
 * which reads `competitionEntries`/`teamMembers` the same way
 * `reflections/load.ts` and `memberStars` do: held an active membership on
 * the entering team at the moment the entry opened, on a competition whose
 * issue has closed. One fixture is on a team with no entry at all (refused),
 * one has entered a competition still open (refused -- nothing to reflect on
 * yet), and one has entered a closed one (allowed).
 *
 * The meeting case guards an adjacent bug this file's fix uncovered:
 * `eligibleActivity`'s meeting branch reads `m."endsAt"` through raw SQL,
 * which comes back as text (see the note in reflections/load.ts), not the
 * `Date` its declared return type claimed. `reflectionDeadline` calls
 * `.getTime()` on it, so every meeting reflection threw before this fix.
 * `expectSession` is mocked the same way `server/actions/teams.db-test.ts`
 * mocks it, so the action runs as a real member without a request context.
 */

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));
// `saveReflection` revalidates the attendance page on success, which needs a
// request's static generation store that a plain Node test never has. Stub
// it the same way `expectSession` is stubbed above, rather than reaching for
// a full Next.js request context just to prove the action wrote correctly.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { saveReflection } = await import("~/server/actions/reflections");

const IDS = {
  member: "e4000000-0000-4000-a000-000000000001",
  team: "e4000000-0000-4000-a000-000000000002",
  competition: "e4000000-0000-4000-a000-000000000005",
  meeting: "e4000000-0000-4000-a000-000000000006",
  openCompetition: "e4000000-0000-4000-a000-000000000007",
  closedCompetition: "e4000000-0000-4000-a000-000000000008",
};

async function cleanup() {
  // Revisions and audit events are append-only (a trigger rejects
  // delete/update), so the fixture teardown has to step around it the same
  // way `recordAttendance`'s db-test does.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."reflectionRevisions" where "userId" = ${IDS.member}::uuid
    `);
    await tx.execute(sql`
      delete from platform."auditEvents" where "actorUserId" = ${IDS.member}::uuid
    `);
  });
  await db.execute(
    sql`delete from platform.reflections where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform.attendance where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform."teamMembers" where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform."competitionEntries" where "teamId" = ${IDS.team}::uuid`,
  );
  await db.execute(
    sql`delete from platform.teams where id = ${IDS.team}::uuid`,
  );
  await db.execute(sql`
    delete from platform.competitions
    where id in (${IDS.competition}::uuid, ${IDS.openCompetition}::uuid, ${IDS.closedCompetition}::uuid)
  `);
  await db.execute(
    sql`delete from platform.meetings where id = ${IDS.meeting}::uuid`,
  );
  await db.execute(
    sql`delete from platform.profile where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(sql`delete from auth.users where id = ${IDS.member}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${IDS.member}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'reflections-action-test@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${IDS.member}::uuid, 'Reflections Action Member')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt", "countsForCredit")
    values (${IDS.meeting}::uuid, 'reflections-action-meeting',
       now() - interval '1 days', now() - interval '1 days' + interval '2 hours', true)
  `);
  await db.execute(sql`
    insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt")
    values (gen_random_uuid(), ${IDS.member}::uuid, ${IDS.meeting}::uuid, 'qr', now())
  `);
  // On a team, but the team has no entry anywhere -- present so this proves
  // the refusal comes from "never entered", not an absent roster.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, 'reflections-action-team', 'Reflections Action Team',
            'ABC456', ${IDS.member}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" (id, "teamId", "userId", role, "joinedAt")
    values (gen_random_uuid(), ${IDS.team}::uuid, ${IDS.member}::uuid, 'lead',
            now() - interval '30 days')
  `);
  await db.execute(sql`
    insert into platform.competitions
      (id, slug, "issueNodeId", "issueNumber", repo, url, title, "kickedOffAt")
    values (${IDS.competition}::uuid, 'reflections-action-competition',
            'ACTION_ISSUE_1', 1, 'DevDogsUGA/DevDogsUGA',
            'https://github.com/DevDogsUGA/DevDogsUGA/issues/1',
            'Reflections Action Competition', now() - interval '10 days')
  `);
  // Entered, but still open -- refused, same as no entry at all.
  await db.execute(sql`
    insert into platform.competitions
      (id, slug, "issueNodeId", "issueNumber", repo, url, title, "kickedOffAt")
    values (${IDS.openCompetition}::uuid, 'reflections-action-open-competition',
            'ACTION_ISSUE_2', 2, 'DevDogsUGA/DevDogsUGA',
            'https://github.com/DevDogsUGA/DevDogsUGA/issues/2',
            'Reflections Action Open Competition', now() - interval '5 days')
  `);
  await db.execute(sql`
    insert into platform."competitionEntries"
      (id, "competitionId", "teamId", "prNodeId", "prNumber", url, "openedAt")
    values (gen_random_uuid(), ${IDS.openCompetition}::uuid, ${IDS.team}::uuid,
            'ACTION_PR_2', 2, 'https://github.com/DevDogsUGA/DevDogsUGA/pull/2',
            now() - interval '4 days')
  `);
  // Entered, and closed -- eligible.
  await db.execute(sql`
    insert into platform.competitions
      (id, slug, "issueNodeId", "issueNumber", repo, url, title, "kickedOffAt", "closedAt")
    values (${IDS.closedCompetition}::uuid, 'reflections-action-closed-competition',
            'ACTION_ISSUE_3', 3, 'DevDogsUGA/DevDogsUGA',
            'https://github.com/DevDogsUGA/DevDogsUGA/issues/3',
            'Reflections Action Closed Competition',
            now() - interval '10 days', now() - interval '2 days')
  `);
  await db.execute(sql`
    insert into platform."competitionEntries"
      (id, "competitionId", "teamId", "prNodeId", "prNumber", url, "openedAt")
    values (gen_random_uuid(), ${IDS.closedCompetition}::uuid, ${IDS.team}::uuid,
            'ACTION_PR_3', 3, 'https://github.com/DevDogsUGA/DevDogsUGA/pull/3',
            now() - interval '9 days')
  `);
});

afterAll(cleanup);

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

describe("saveReflection", () => {
  it("refuses a competition the member's team never entered", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "competition",
        activityId: IDS.competition,
        content: "My reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({
      ok: false,
      message: "You are not eligible for this reflection.",
    });
  });

  it("refuses a competition the member's team entered but is still open", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "competition",
        activityId: IDS.openCompetition,
        content: "My reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({
      ok: false,
      message: "You are not eligible for this reflection.",
    });
  });

  it("allows a competition reflection once the entered competition has closed", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "competition",
        activityId: IDS.closedCompetition,
        content: "My competition reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({ ok: true, message: "Draft saved." });
  });

  it("saves a meeting reflection instead of throwing on the decoded deadline", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "meeting",
        activityId: IDS.meeting,
        content: "My meeting reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({ ok: true, message: "Draft saved." });
  });
});
