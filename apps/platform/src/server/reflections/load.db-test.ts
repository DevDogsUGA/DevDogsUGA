// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { getReflectionActivities } from "./load";

/**
 * The interesting case here is not "meeting activities load" -- it is that
 * the query PARSES AND RUNS at all. The teams-core migration dropped
 * "teams"."competitionId" and "teams"."competedAt"; before this file
 * existed, nothing exercised the raw SQL's `union all`, so a query that
 * referenced either dropped column would fail Postgres's parse of the WHOLE
 * statement -- and every signed-in visitor to /attendance would 500 -- while
 * `pnpm test:db` stayed green. This fixture puts the member on a team, so if
 * the competition branch ever again reaches for a column "teams" no longer
 * has, this test fails with a real Postgres error instead of silently
 * passing.
 */

const IDS = {
  member: "e3000000-0000-4000-a000-000000000001",
  meeting: "e3000000-0000-4000-a000-000000000002",
  team: "e3000000-0000-4000-a000-000000000003",
  workshopMeeting: "e3000000-0000-4000-a000-000000000004",
  workshop: "e3000000-0000-4000-a000-000000000005",
  competition: "e3000000-0000-4000-a000-000000000006",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform.attendance where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform."teamMembers" where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform.teams where id = ${IDS.team}::uuid`,
  );
  await db.execute(
    sql`delete from platform.competitions where id = ${IDS.competition}::uuid`,
  );
  await db.execute(
    sql`delete from platform.workshops where id = ${IDS.workshop}::uuid`,
  );
  await db.execute(sql`
    delete from platform.meetings
    where id in (${IDS.meeting}::uuid, ${IDS.workshopMeeting}::uuid)
  `);
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
    values
      (${IDS.meeting}::uuid, 'reflections-load-meeting', 'Reflections Load Meeting',
       now() - interval '2 days', now() - interval '2 days' + interval '2 hours', true),
      (${IDS.workshopMeeting}::uuid, 'reflections-load-workshop-meeting', null,
       now() - interval '3 days', now() - interval '3 days' + interval '2 hours', true)
  `);
  await db.execute(sql`
    insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt")
    values (gen_random_uuid(), ${IDS.member}::uuid, ${IDS.meeting}::uuid, 'qr', now())
  `);
  await db.execute(sql`
    insert into platform.workshops (id, "meetingId", title, project)
    values (${IDS.workshop}::uuid, ${IDS.workshopMeeting}::uuid,
            'Load Comp Workshop', 'Load Comp Project')
  `);
  await db.execute(sql`
    insert into platform.competitions (id, slug, "workshopId", "elEligible")
    values (${IDS.competition}::uuid, 'reflections-load-competition',
            ${IDS.workshop}::uuid, true)
  `);
  // The member is on a team, which is exactly the shape that used to route
  // through "teams"."competitionId"/"competedAt" -- present so the
  // competition branch has real rows to (correctly) not return.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, 'reflections-load-team', 'Reflections Load Team',
            'ABC345', ${IDS.member}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" (id, "teamId", "userId", role)
    values (gen_random_uuid(), ${IDS.team}::uuid, ${IDS.member}::uuid, 'lead')
  `);
});

afterAll(cleanup);

describe("getReflectionActivities", () => {
  it("returns the member's meeting activities without erroring on the competition branch", async () => {
    const { activities } = await getReflectionActivities(IDS.member);
    const mine = activities.filter((a) => a.activityId === IDS.meeting);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      activityType: "meeting",
      label: "Reflections Load Meeting",
    });
  });

  it("yields no competition activity, per the memberStars stub", async () => {
    const { activities } = await getReflectionActivities(IDS.member);
    expect(activities.some((a) => a.activityType === "competition")).toBe(
      false,
    );
  });
});
