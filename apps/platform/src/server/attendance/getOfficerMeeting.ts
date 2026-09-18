import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { attendance, meetings } from "~/server/db/schema";

export async function getOfficerAttendanceMeeting(meetingId: string) {
  const [meeting] = await db
    .select({
      id: meetings.id,
      nameOverride: meetings.nameOverride,
      kind: meetings.kind,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      cancelledAt: meetings.cancelledAt,
      attendanceCount: sql<number>`(
        select count(*)::int
        from ${attendance}
        where ${attendance.meetingId} = ${meetings.id}
          and ${attendance.revokedAt} is null
      )`,
    })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), isNull(meetings.deletedAt)))
    .limit(1);
  return meeting ?? null;
}

export async function getOfficerAttendanceMeetings() {
  return db
    .select({
      id: meetings.id,
      nameOverride: meetings.nameOverride,
      kind: meetings.kind,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      cancelledAt: meetings.cancelledAt,
    })
    .from(meetings)
    .where(isNull(meetings.deletedAt))
    .orderBy(desc(meetings.startsAt), desc(meetings.id));
}
