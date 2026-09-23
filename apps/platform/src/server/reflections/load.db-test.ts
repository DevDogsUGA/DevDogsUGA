// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { getReflectionActivities } from "./load";

/**
 * The interesting case here is not "meeting activities load" -- it is that
 * the query PARSES AND RUNS at all, and that its competition branch reads
 * `competitionEntries`/`teamMembers` the same way `memberStars` does. Before
 * this file existed, nothing exercised the raw SQL's `union all`, so a query
 * referencing a column neither table has would fail Postgres's parse of the
 * WHOLE statement -- and every signed-in visitor to /attendance would 500 --
 * while `pnpm test` stayed green.
 */

const IDS = {
  member: "e3000000-0000-4000-a000-000000000001",
  meeting: "e3000000-0000-4000-a000-000000000002",
  team: "e3000000-0000-4000-a000-000000000003",
  competition: "e3000000-0000-4000-a000-000000000006",
  openCompetition: "e3000000-0000-4000-a000-000000000007",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform.attendance where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform."competitionEntries" where "teamId" = ${IDS.team}::uuid`,
  );
  await db.execute(
    sql`delete from platform."teamMembers" where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform.teams where id = ${IDS.team}::uuid`,
  );
  await db.execute(sql`
    delete from platform.competitions
    where id in (${IDS.competition}::uuid, ${IDS.openCompetition}::uuid)
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
            'authenticated', 'authenticated', 'reflections-load-test@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${IDS.member}::uuid, 'Reflections Load Member')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, "nameOverride", "startsAt", "endsAt", "countsForCredit")
    values (${IDS.meeting}::uuid, 'reflections-load-meeting', 'Reflections Load Meeting',
            now() - interval '2 days', now() - interval '2 days' + interval '2 hours', true)
  `);
  await db.execute(sql`
    insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt")
    values (gen_random_uuid(), ${IDS.member}::uuid, ${IDS.meeting}::uuid, 'qr', now())
  `);
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, 'reflections-load-team', 'Reflections Load Team',
            'ABC345', ${IDS.member}::uuid)
  `);
  // Joined well before either competition's entry opened, and never left.
  await db.execute(sql`
    insert into platform."teamMembers" (id, "teamId", "userId", role, "joinedAt")
    values (gen_random_uuid(), ${IDS.team}::uuid, ${IDS.member}::uuid, 'lead',
            now() - interval '30 days')
  `);
  // Closed: this is the one the competition branch should surface.
  await db.execute(sql`
    insert into platform.competitions
      (id, slug, "issueNodeId", "issueNumber", repo, url, title, "kickedOffAt", "closedAt")
    values (${IDS.competition}::uuid, 'reflections-load-competition',
            'REFL_ISSUE_1', 1, 'DevDogsUGA/DevDogsUGA',
            'https://github.com/DevDogsUGA/DevDogsUGA/issues/1',
            'Reflections Load Competition',
            now() - interval '10 days', now() - interval '3 days')
  `);
  await db.execute(sql`
    insert into platform."competitionEntries"
      (id, "competitionId", "teamId", "prNodeId", "prNumber", url, "openedAt")
    values (gen_random_uuid(), ${IDS.competition}::uuid, ${IDS.team}::uuid,
            'REFL_PR_1', 1, 'https://github.com/DevDogsUGA/DevDogsUGA/pull/1',
            now() - interval '8 days')
  `);
  // Still open: entered, but nothing should surface yet -- there is nothing
  // to reflect ON until the competition is actually over.
  await db.execute(sql`
    insert into platform.competitions
      (id, slug, "issueNodeId", "issueNumber", repo, url, title, "kickedOffAt")
    values (${IDS.openCompetition}::uuid, 'reflections-load-open-competition',
            'REFL_ISSUE_2', 2, 'DevDogsUGA/DevDogsUGA',
            'https://github.com/DevDogsUGA/DevDogsUGA/issues/2',
            'Reflections Load Open Competition', now() - interval '2 days')
  `);
  await db.execute(sql`
    insert into platform."competitionEntries"
      (id, "competitionId", "teamId", "prNodeId", "prNumber", url, "openedAt")
    values (gen_random_uuid(), ${IDS.openCompetition}::uuid, ${IDS.team}::uuid,
            'REFL_PR_2', 2, 'https://github.com/DevDogsUGA/DevDogsUGA/pull/2',
            now() - interval '1 day')
  `);
});

afterAll(cleanup);

describe("getReflectionActivities", () => {
  it("returns the member's meeting activities", async () => {
    const { activities } = await getReflectionActivities(IDS.member);
    const mine = activities.filter((a) => a.activityId === IDS.meeting);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      activityType: "meeting",
      label: "Reflections Load Meeting",
    });
  });

  it("surfaces a closed competition the member's team entered", async () => {
    const { activities } = await getReflectionActivities(IDS.member);
    const mine = activities.filter((a) => a.activityId === IDS.competition);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      activityType: "competition",
      label: "Reflections Load Competition",
    });
  });

  it("withholds a still-open competition, even one the member entered", async () => {
    const { activities } = await getReflectionActivities(IDS.member);
    expect(activities.some((a) => a.activityId === IDS.openCompetition)).toBe(
      false,
    );
  });
});
