// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { getStreakForUser } from "./streak";

const MEETING_ID = "a3000000-0000-4000-a000-000000000001";
const USER_ID = "a3000000-0000-4000-a000-0000000000ff";

async function cleanup() {
  await db.execute(sql`
    delete from platform.meetings where id = ${MEETING_ID}::uuid
  `);
}

beforeAll(async () => {
  await cleanup();
  await db.execute(sql`
    insert into platform.meetings
      (id, slug, "startsAt", "endsAt", "countsForCredit") values
      (${MEETING_ID}::uuid, 'streak-loader-counting',
       '2026-09-10T22:00:00Z', '2026-09-10T23:30:00Z', true)
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
});
