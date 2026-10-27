// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { getStreakForUser } from "./streak";

const MEETING_ID = "a3000000-0000-4000-a000-000000000001";
const USER_ID = "a3000000-0000-4000-a000-0000000000ff";
const PLAIN_MEETING_ID = "a3000000-0000-4000-a000-000000000002";
const ATTENDEE_ID = "a3000000-0000-4000-a000-0000000000fe";

async function cleanup() {
  await db.execute(sql`
    delete from platform.attendance where "userId" = ${ATTENDEE_ID}::uuid
  `);
  await db.execute(sql`delete from auth.users where id = ${ATTENDEE_ID}::uuid`);
  await db.execute(sql`
    delete from platform.meetings
    where id in (${MEETING_ID}::uuid, ${PLAIN_MEETING_ID}::uuid)
  `);
}

beforeAll(async () => {
  await cleanup();
  await db.execute(sql`
    insert into platform.meetings
      (id, slug, "startsAt", "endsAt") values
      (${MEETING_ID}::uuid, 'streak-loader-counting',
       '2026-09-10T22:00:00Z', '2026-09-10T23:30:00Z')
  `);
  await db.execute(sql`
    insert into platform.workshops ("meetingId", "definitionId")
    values (${MEETING_ID}::uuid, 'streak-loader-workshop')
  `);
  // A night with no workshop (a Merge Monday, a social): attending it alone
  // earns no streak week (Q165).
  await db.execute(sql`
    insert into platform.meetings
      (id, slug, "startsAt", "endsAt") values
      (${PLAIN_MEETING_ID}::uuid, 'streak-loader-plain',
       '2026-09-14T22:00:00Z', '2026-09-14T23:30:00Z')
  `);
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${ATTENDEE_ID}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'streak-loader-test@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt")
    values (gen_random_uuid(), ${ATTENDEE_ID}::uuid, ${PLAIN_MEETING_ID}::uuid, 'qr',
            '2026-09-14T22:30:00Z')
  `);
});

afterAll(cleanup);

describe("getStreakForUser", () => {
  // `db.execute` hands timestamps back as text, and the week bucketing
  // formats them through Intl -- which throws "Invalid time value" on a
  // string. Any counting meeting was enough to take /attendance down for
  // every signed-in member.
  it("buckets real rows without throwing on raw timestamp text", async () => {
    const streak = await getStreakForUser(USER_ID);
    expect(streak.current).toBe(0);
    expect(Number.isInteger(streak.longest)).toBe(true);
  });

  it("gives no streak week for attending a night with no workshop", async () => {
    const streak = await getStreakForUser(ATTENDEE_ID);
    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(0);
  });
});
