import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { db } from "~/server/db";
import { attendance, meetings } from "~/server/db/schema";
import { correlatedCount } from "~/server/db/correlatedCount";

// SQL fragments only, so no connection: see the same builder in
// `~/server/loaders/meetings`.
const qb = new QueryBuilder();

export async function getOfficerAttendanceMeeting(meetingId: string) {
  const [meeting] = await db
    .select({
      id: meetings.id,
      nameOverride: meetings.nameOverride,
      kind: meetings.kind,
      building: meetings.building,
      location: meetings.location,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      cancelledAt: meetings.cancelledAt,
      // Not a raw `sql` subquery: that renders `"meetingId" = "id"`, which
      // binds both sides to attendance and counts 0. See `correlatedCount`.
      attendanceCount: correlatedCount(
        qb
          .select({ n: sql`count(*)::int` })
          .from(attendance)
          .where(eq(attendance.meetingId, meetings.id)),
      ),
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
