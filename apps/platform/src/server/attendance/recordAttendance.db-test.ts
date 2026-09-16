// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { attendance } from "~/server/db/schema";
import { recordMemberAttendance } from "./recordAttendance";

const IDS = {
  meeting: "a1000000-0000-4000-a000-000000000001",
  cancelledMeeting: "a1000000-0000-4000-a000-000000000002",
  member: "a1000000-0000-4000-a000-000000000003",
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
        and metadata ->> 'meetingId' in (${IDS.meeting}, ${IDS.cancelledMeeting})
    `);
  });
  await db.execute(sql`
    delete from platform.meetings
    where id in (${IDS.meeting}::uuid, ${IDS.cancelledMeeting}::uuid)
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
      (id, slug, "nameOverride", "startsAt", "endsAt", "cancelledAt")
    values
      (${IDS.meeting}::uuid, 'attendance-test', 'Attendance Test',
       now() - interval '1 year', now() - interval '364 days', null),
      (${IDS.cancelledMeeting}::uuid, 'attendance-cancelled', 'Cancelled',
       now(), now() + interval '1 hour', now())
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

  it("does not restore revoked attendance", async () => {
    await db
      .update(attendance)
      .set({
        revokedAt: new Date(),
        revokedBy: IDS.member,
        revocationReason: "Test correction",
      })
      .where(sql`${attendance.meetingId} = ${IDS.meeting}::uuid`);

    const result = await recordMemberAttendance(IDS.meeting, IDS.member, "qr");
    expect(result.status).toBe("revoked");
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
