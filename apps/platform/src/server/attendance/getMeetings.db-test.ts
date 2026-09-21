// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { getAttendanceMeetings } from "./getMeetings";

const IDS = {
  endsFirst: "a2000000-0000-4000-a000-000000000001",
  startsFirst: "a2000000-0000-4000-a000-000000000002",
  startsLater: "a2000000-0000-4000-a000-000000000003",
  past: "a2000000-0000-4000-a000-000000000004",
  future: "a2000000-0000-4000-a000-000000000005",
  nonCounting: "a2000000-0000-4000-a000-000000000006",
};

async function cleanup() {
  await db.execute(sql`
    delete from platform.meetings
    where id in (
      ${IDS.endsFirst}::uuid,
      ${IDS.startsFirst}::uuid,
      ${IDS.startsLater}::uuid,
      ${IDS.past}::uuid,
      ${IDS.future}::uuid,
      ${IDS.nonCounting}::uuid
    )
  `);
}

beforeAll(async () => {
  await cleanup();
  await db.execute(sql`
    insert into platform.meetings
      (id, slug, "startsAt", "endsAt", "countsTowardProgress") values
      (${IDS.endsFirst}::uuid, 'attendance-order-ends-first',
       '2026-09-11T18:00:00Z', '2026-09-11T21:00:00Z', true),
      (${IDS.startsFirst}::uuid, 'attendance-order-starts-first',
       '2026-09-11T18:00:00Z', '2026-09-11T22:00:00Z', true),
      (${IDS.startsLater}::uuid, 'attendance-order-starts-later',
       '2026-09-11T19:00:00Z', '2026-09-11T21:30:00Z', true),
      (${IDS.past}::uuid, 'attendance-order-past',
       '2026-09-10T18:00:00Z', '2026-09-10T20:00:00Z', true),
      (${IDS.future}::uuid, 'attendance-order-future',
       '2026-09-12T18:00:00Z', '2026-09-12T20:00:00Z', true),
      (${IDS.nonCounting}::uuid, 'attendance-order-noncounting',
       '2026-09-11T18:00:00Z', '2026-09-11T21:00:00Z', false)
  `);
});

afterAll(cleanup);

describe("attendance meeting selection", () => {
  it("puts ongoing meetings first using start, end, and UUID tie-breaks", async () => {
    const meetings = await getAttendanceMeetings(
      new Date("2026-09-11T20:00:00Z"),
    );
    const fixtures = meetings.filter((meeting) =>
      Object.values(IDS).includes(meeting.id),
    );
    expect(fixtures.map((meeting) => meeting.id)).toEqual([
      IDS.endsFirst,
      IDS.startsFirst,
      IDS.startsLater,
      IDS.past,
    ]);
    expect(fixtures.slice(0, 3).every((meeting) => meeting.ongoing)).toBe(true);
    expect(fixtures.some((meeting) => meeting.id === IDS.future)).toBe(false);
    // Ongoing at this instant, but it does not count toward progress, so it is
    // not offered for check-in: recording it would dead-end with no star.
    expect(fixtures.some((meeting) => meeting.id === IDS.nonCounting)).toBe(
      false,
    );
  });
});
