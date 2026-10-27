// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { getReflectionActivities } from "./load";

/**
 * The interesting case here is not "meeting activities load" -- it is that
 * the query PARSES AND RUNS at all. Raw SQL is only checked by Postgres, so a
 * column the table does not have would fail the WHOLE statement -- and every
 * signed-in visitor to /attendance would 500 -- while `pnpm test` stayed green.
 */

const IDS = {
  member: "e3000000-0000-4000-a000-000000000001",
  meeting: "e3000000-0000-4000-a000-000000000002",
  plainMeeting: "e3000000-0000-4000-a000-000000000003",
  lateMeeting: "e3000000-0000-4000-a000-000000000004",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform.attendance where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform.meetings where id in (${IDS.meeting}::uuid, ${IDS.plainMeeting}::uuid, ${IDS.lateMeeting}::uuid)`,
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
    insert into platform.meetings (id, slug, "nameOverride", "startsAt", "endsAt")
    values (${IDS.meeting}::uuid, 'reflections-load-meeting', 'Reflections Load Meeting',
            now() - interval '2 days', now() - interval '2 days' + interval '2 hours'),
      (${IDS.plainMeeting}::uuid, 'reflections-load-plain', 'Reflections Load Plain',
            now() - interval '2 days', now() - interval '2 days' + interval '2 hours'),
      (${IDS.lateMeeting}::uuid, 'reflections-load-late', 'Reflections Load Late',
            now() - interval '30 days', now() - interval '30 days' + interval '2 hours')
  `);
  await db.execute(sql`
    insert into platform.workshops ("meetingId", "definitionId")
    values (${IDS.meeting}::uuid, 'reflections-load-workshop'),
      (${IDS.lateMeeting}::uuid, 'reflections-load-late-workshop')
  `);
  await db.execute(sql`
    insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt")
    values (gen_random_uuid(), ${IDS.member}::uuid, ${IDS.meeting}::uuid, 'qr', now() - interval '2 days' + interval '1 hour'),
      (gen_random_uuid(), ${IDS.member}::uuid, ${IDS.plainMeeting}::uuid, 'qr', now()),
      (gen_random_uuid(), ${IDS.member}::uuid, ${IDS.lateMeeting}::uuid, 'officer', now())
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

  it("leaves out an attended meeting that links no workshop (Q165)", async () => {
    const { activities } = await getReflectionActivities(IDS.member);
    expect(activities.some((a) => a.activityId === IDS.plainMeeting)).toBe(
      false,
    );
  });

  it("opens the window at the attendance record when that is later than the meeting's end (Q52)", async () => {
    const now = new Date();
    const { activities } = await getReflectionActivities(IDS.member, now);
    const late = activities.find((a) => a.activityId === IDS.lateMeeting);
    // The meeting ended 30 days ago, but the officer added the member now.
    expect(late?.canEdit).toBe(true);
    expect(late!.deadline.getTime()).toBeGreaterThan(
      now.getTime() + 6 * 24 * 60 * 60 * 1000,
    );
    // A member checked in at the meeting keeps the old rule: end + window.
    const prompt = activities.find((a) => a.activityId === IDS.meeting);
    expect(prompt!.deadline.getTime()).toBeLessThan(late!.deadline.getTime());
  });
});
