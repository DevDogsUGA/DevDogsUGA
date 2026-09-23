// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { streamReflectionRows } from "./reflections";

const IDS = {
  member: "e2000000-0000-4000-a000-000000000001",
  meeting: "e2000000-0000-4000-a000-000000000002",
  workshopMeeting: "e2000000-0000-4000-a000-000000000003",
  workshop: "e2000000-0000-4000-a000-000000000004",
  competition: "e2000000-0000-4000-a000-000000000005",
  meetingReflection: "e2000000-0000-4000-a000-000000000006",
  competitionReflection: "e2000000-0000-4000-a000-000000000007",
};

async function collect(...args: Parameters<typeof streamReflectionRows>) {
  const rows = [];
  for await (const row of streamReflectionRows(...args)) rows.push(row);
  return rows;
}

async function cleanup() {
  // Revisions are append-only (a trigger rejects delete/update), so the
  // fixture teardown has to step around it the same way `recordAttendance`'s
  // db-test does for `auditEvents`.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."reflectionRevisions" where "userId" = ${IDS.member}::uuid
    `);
  });
  await db.execute(sql`
    delete from platform.reflections where "userId" = ${IDS.member}::uuid
  `);
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
            'authenticated', 'authenticated', 'reflections-export-test@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${IDS.member}::uuid, 'Reflections Export Member')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, "nameOverride", "startsAt", "endsAt")
    values
      (${IDS.meeting}::uuid, 'reflections-export-meeting',
       'Reflections Export Meeting',
       now() - interval '2 days', now() - interval '2 days' + interval '2 hours'),
      (${IDS.workshopMeeting}::uuid, 'reflections-export-workshop-meeting', null,
       now() - interval '3 days', now() - interval '3 days' + interval '2 hours')
  `);
  await db.execute(sql`
    insert into platform.workshops (id, "meetingId", title, project)
    values (${IDS.workshop}::uuid, ${IDS.workshopMeeting}::uuid,
            'Export Comp Workshop', 'Export Comp Project')
  `);
  // Title left null so the export falls back to the workshop's title -- the
  // same fallback chain the stars grid uses.
  await db.execute(sql`
    insert into platform.competitions (id, slug, "workshopId", title)
    values (${IDS.competition}::uuid, 'reflections-export-competition',
            ${IDS.workshop}::uuid, null)
  `);
  await db.execute(sql`
    insert into platform.reflections
      (id, "userId", "meetingId", content, "submittedAt")
    values (${IDS.meetingReflection}::uuid, ${IDS.member}::uuid,
            ${IDS.meeting}::uuid, 'My meeting reflection', now())
  `);
  await db.execute(sql`
    insert into platform.reflections
      (id, "userId", "competitionId", content, "submittedAt")
    values (${IDS.competitionReflection}::uuid, ${IDS.member}::uuid,
            ${IDS.competition}::uuid, 'My competition reflection', null)
  `);
  // Two revisions on the meeting reflection, none on the competition one, so
  // the count column has to be a real count and not a constant.
  await db.execute(sql`
    insert into platform."reflectionRevisions"
      (id, "reflectionId", "userId", "meetingId", content, "createdByUserId")
    values
      (gen_random_uuid(), ${IDS.meetingReflection}::uuid, ${IDS.member}::uuid,
       ${IDS.meeting}::uuid, 'draft one', ${IDS.member}::uuid),
      (gen_random_uuid(), ${IDS.meetingReflection}::uuid, ${IDS.member}::uuid,
       ${IDS.meeting}::uuid, 'My meeting reflection', ${IDS.member}::uuid)
  `);
});

afterAll(cleanup);

describe("streamReflectionRows", () => {
  it("emits one row per reflection with identity, activity, and revision columns", async () => {
    const rows = (await collect({}, 10)).filter(
      (row) => row.userId === IDS.member,
    );
    expect(rows).toHaveLength(2);

    const meetingRow = rows.find((row) => row.activityType === "meeting");
    expect(meetingRow).toMatchObject({
      preferredName: "Reflections Export Member",
      email: "reflections-export-test@uga.edu",
      activityId: IDS.meeting,
      activityTitle: "Reflections Export Meeting",
      content: "My meeting reflection",
      revisionCount: 2,
    });
    expect(meetingRow!.submittedAt).not.toBeNull();

    const competitionRow = rows.find(
      (row) => row.activityType === "competition",
    );
    expect(competitionRow).toMatchObject({
      activityId: IDS.competition,
      // The competition's own title is null, so this falls through to the
      // workshop that opened it.
      activityTitle: "Export Comp Workshop",
      content: "My competition reflection",
      revisionCount: 0,
    });
    expect(competitionRow!.submittedAt).toBeNull();
  });

  it("scopes to a date range on when the reflection was created", async () => {
    const rows = await collect(
      { from: new Date(Date.now() - 3 * 86_400_000), to: new Date() },
      10,
    );
    const mine = rows.filter((row) => row.userId === IDS.member);
    expect(mine).toHaveLength(2);
  });
});
