// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { recordMemberAttendance } from "./recordAttendance";

const IDS = {
  meeting: "a1000000-0000-4000-a000-000000000001",
  cancelledMeeting: "a1000000-0000-4000-a000-000000000002",
  member: "a1000000-0000-4000-a000-000000000003",
  nonCountingMeeting: "a1000000-0000-4000-a000-000000000004",
};

async function cleanup() {
  await db.execute(sql`
    delete from platform.attendance where "userId" = ${IDS.member}::uuid
  `);
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."auditEvents"
      where "targetType" = 'attendance'
        and metadata ->> 'meetingId' in (
          ${IDS.meeting}, ${IDS.cancelledMeeting}, ${IDS.nonCountingMeeting}
        )
    `);
  });
  await db.execute(sql`
    delete from platform.meetings
    where id in (
      ${IDS.meeting}::uuid,
      ${IDS.cancelledMeeting}::uuid,
      ${IDS.nonCountingMeeting}::uuid
    )
  `);
  await db.execute(sql`delete from auth.users where id = ${IDS.member}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${IDS.member}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'attendance-test@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.meetings
      (id, slug, "nameOverride", "startsAt", "endsAt", "cancelledAt",
       "countsForCredit")
    values
      (${IDS.meeting}::uuid, 'attendance-test', 'Attendance Test',
       now() - interval '1 year', now() - interval '364 days', null, true),
      (${IDS.cancelledMeeting}::uuid, 'attendance-cancelled', 'Cancelled',
       now(), now() + interval '1 hour', now(), true),
      (${IDS.nonCountingMeeting}::uuid, 'attendance-noncounting', 'Not Counting',
       now() - interval '1 year', now() - interval '364 days', null, false)
  `);
});

afterAll(cleanup);

describe("recordMemberAttendance", () => {
  it("records one row and one audit event across concurrent duplicate scans", async () => {
    const results = await Promise.all([
      recordMemberAttendance(IDS.meeting, IDS.member, "qr"),
      recordMemberAttendance(IDS.meeting, IDS.member, "qr"),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "duplicate",
      "recorded",
    ]);

    const rows = await db.execute<{
      attendanceCount: number;
      eventCount: number;
    }>(
      sql`select
            (select count(*)::int from platform.attendance
             where "meetingId" = ${IDS.meeting}::uuid
               and "userId" = ${IDS.member}::uuid) as "attendanceCount",
            (select count(*)::int from platform."auditEvents"
             where action = 'attendance.recorded'
               and metadata ->> 'meetingId' = ${IDS.meeting}) as "eventCount"`,
    );
    expect(rows[0]).toEqual({ attendanceCount: 1, eventCount: 1 });
  });

  it("returns the original receipt without changing its timestamp", async () => {
    const first = await recordMemberAttendance(IDS.meeting, IDS.member, "qr");
    const repeat = await recordMemberAttendance(
      IDS.meeting,
      IDS.member,
      "manual_code",
    );
    expect(first.status).toBe("duplicate");
    expect(repeat.status).toBe("duplicate");
    if (first.status === "duplicate" && repeat.status === "duplicate") {
      expect(repeat.attendanceId).toBe(first.attendanceId);
      expect(repeat.recordedAt).toEqual(first.recordedAt);
    }
  });

  it("records a meeting that doesn't count for credit, earning no star", async () => {
    const result = await recordMemberAttendance(
      IDS.nonCountingMeeting,
      IDS.member,
      "qr",
    );
    expect(result.status).toBe("recorded");

    const rows = await db.execute<{ attended: number; stars: number }>(sql`
      select
        (select count(*)::int from platform.attendance
          where "meetingId" = ${IDS.nonCountingMeeting}::uuid) as attended,
        (select count(*)::int from platform."memberStars"
          where "meetingId" = ${IDS.nonCountingMeeting}::uuid) as stars`);
    expect(rows[0]).toEqual({ attended: 1, stars: 0 });
  });

  it("rejects cancelled and unknown meetings independent of clock time", async () => {
    await expect(
      recordMemberAttendance(IDS.cancelledMeeting, IDS.member, "qr"),
    ).resolves.toEqual({ status: "invalid_meeting" });
    await expect(
      recordMemberAttendance(
        "a1000000-0000-4000-a000-000000000099",
        IDS.member,
        "manual_code",
      ),
    ).resolves.toEqual({ status: "invalid_meeting" });
  });
});
