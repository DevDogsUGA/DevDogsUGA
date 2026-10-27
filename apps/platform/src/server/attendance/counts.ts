import { sql } from "drizzle-orm";
import type { AttendanceCount } from "~/lib/attendanceCount";
import { db } from "~/server/db";

/**
 * Attendance per meeting with the officers split out (Q13), as ONE grouped
 * query so the meeting list stays cheap however many meetings it shows. An
 * officer is anyone holding an `isLeadership` role right now, not when they
 * checked in. Meetings nobody attended are absent from the map.
 */
export async function getAttendanceCounts(): Promise<
  Map<string, AttendanceCount>
> {
  const rows = await db.execute<{
    meetingId: string;
    total: number;
    officers: number;
  }>(sql`
    select a."meetingId", count(*)::int as total,
      (count(*) filter (where o."userId" is not null))::int as officers
    from platform.attendance a
    left join (
      select distinct ur."userId"
      from platform."userRoles" ur
      join platform.roles r on r.id = ur."roleId"
      where r."isLeadership"
    ) o on o."userId" = a."userId"
    group by a."meetingId"
  `);
  return new Map(
    rows.map((row) => [
      row.meetingId,
      { total: row.total, officers: row.officers },
    ]),
  );
}
