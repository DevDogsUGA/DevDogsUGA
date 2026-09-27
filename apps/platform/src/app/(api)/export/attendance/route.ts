import { sql } from "drizzle-orm";
import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { canUserExportStars } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { csvStream } from "~/server/export/csv";
import {
  ATTENDANCE_COLUMNS,
  type AttendanceFilters,
  parseAttendanceFilters,
  projectAttendanceRow,
  streamAttendanceRows,
} from "~/server/export/attendance";

/**
 * GET /export/attendance
 *
 * One row per check-in, across every semester. Query parameters: `from`,
 * `to` (ISO dates, on the meeting start) and `meetingId` (scopes to a single
 * meeting, the id the officer console already has on a meeting's own page).
 *
 * Gated on `canExportStars`, the same flag `/export/stars` uses -- see that
 * route's comment for why the flag is kept separate from
 * `canManageAttendance`. It stays the one flag for every export rather than
 * growing a second: two officers who need to know a member's attendance
 * pattern and their star count are the same officer, not two different ones.
 *
 * Every download is audited, the same as `/export/stars`.
 */
export async function GET(request: Request) {
  await connection();

  const callerId = await expectSession().catch(() => null);
  if (!callerId) unauthorized();
  if (!(await canUserExportStars(callerId))) unauthorized();

  const filters = parseAttendanceFilters(new URL(request.url));

  // Written BEFORE the stream, not after -- see `/export/stars` for why: a
  // download that fails halfway still put rows in front of somebody.
  await recordDownload(callerId, filters);

  const stream = csvStream(
    [...ATTENDANCE_COLUMNS],
    streamAttendanceRows(filters),
    projectAttendanceRow,
  );

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename(filters)}"`,
      // The response is a snapshot of live data and carries member emails.
      // Neither a browser nor an intermediary should keep a copy.
      "Cache-Control": "no-store, private",
    },
  });
}

async function recordDownload(
  userId: string,
  filters: AttendanceFilters,
): Promise<void> {
  await db.execute(sql`
    insert into "platform"."exportAudit" ("userId", "kind", "filters")
    values (${userId}, 'attendance', ${JSON.stringify(serialize(filters))}::jsonb)
  `);
}

/**
 * The filters as recorded. See `/export/stars`'s `serialize`: an unfiltered
 * download is recorded as an explicit empty object rather than as an absent
 * field, so it is distinguishable from a slice.
 */
function serialize(filters: AttendanceFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.from) out.from = filters.from.toISOString();
  if (filters.to) out.to = filters.to.toISOString();
  if (filters.meetingId) out.meetingId = filters.meetingId;
  return out;
}

function filename(filters: AttendanceFilters): string {
  const parts = ["attendance"];
  if (filters.meetingId) parts.push(filters.meetingId);
  if (filters.from) parts.push(filters.from.toISOString().slice(0, 10));
  if (filters.to) parts.push(filters.to.toISOString().slice(0, 10));
  return `${parts.join("-")}.csv`;
}
