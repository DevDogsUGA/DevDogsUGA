import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { attendance, meetings, profiles } from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";
import {
  ATTENDANCE_COLUMNS,
  type AttendanceFilters,
  type AttendanceRow,
  parseAttendanceFilters,
  projectAttendanceRow,
} from "./attendanceCsv";

export {
  ATTENDANCE_COLUMNS,
  type AttendanceFilters,
  type AttendanceRow,
  parseAttendanceFilters,
  projectAttendanceRow,
};

export async function* streamAttendanceRows(
  filters: AttendanceFilters = {},
  pageSize = 500,
): AsyncGenerator<AttendanceRow> {
  let offset = 0;
  for (;;) {
    const page = await attendancePage(filters, pageSize, offset);
    for (const row of page) yield row;
    if (page.length < pageSize) return;
    offset += pageSize;
  }
}

async function attendancePage(
  filters: AttendanceFilters,
  limit: number,
  offset: number,
): Promise<AttendanceRow[]> {
  const conditions = [];
  if (filters.from) conditions.push(gte(meetings.startsAt, filters.from));
  if (filters.to) conditions.push(lte(meetings.startsAt, filters.to));
  if (filters.meetingId)
    conditions.push(eq(attendance.meetingId, filters.meetingId));

  const rows = await db
    .select({
      userId: attendance.userId,
      preferredName: profiles.preferredName,
      email: usersInAuth.email,
      githubLogin: sql<string | null>`(
        select i.identity_data ->> 'user_name'
        from auth.identities i
        where i.user_id = ${attendance.userId} and i.provider = 'github'
        limit 1
      )`,
      meetingConfigId: meetings.configId,
      // Same fallback chain as `meetingTitle` (nameOverride, then kind, then a
      // placeholder), simplified to skip the date and the workshop agenda:
      // this is a table row that already prints the date in its own column,
      // and widening the query with a workshop join for a label nobody would
      // choose over the date is a join per row for a string this cheap to
      // approximate.
      meetingTitle: sql<string>`coalesce(${meetings.nameOverride}, ${meetings.kind}, 'Meeting')`,
      meetingStartsAt: meetings.startsAt,
      checkedInAt: attendance.recordedAt,
      method: attendance.method,
      countsForCredit: meetings.countsForCredit,
    })
    .from(attendance)
    .innerJoin(meetings, eq(meetings.id, attendance.meetingId))
    .leftJoin(profiles, eq(profiles.userId, attendance.userId))
    .leftJoin(usersInAuth, eq(usersInAuth.id, attendance.userId))
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(meetings.startsAt), asc(attendance.userId), asc(attendance.id))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    userId: row.userId,
    preferredName: row.preferredName,
    email: row.email,
    githubLogin: row.githubLogin,
    meetingConfigId: row.meetingConfigId,
    meetingTitle: row.meetingTitle,
    meetingStartsAt: row.meetingStartsAt,
    checkedInAt: row.checkedInAt,
    method: row.method,
    countsForCredit: row.countsForCredit,
  }));
}
