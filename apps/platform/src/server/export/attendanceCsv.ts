import { csvTimestamp } from "./csv";

/**
 * The CSV shape for `/export/attendance`, split from `attendance.ts` so it
 * can be unit-tested without a database -- the same split `streakPolicy.ts`
 * draws from `streak.ts`. One row per check-in, not one row per member:
 * `stars.ts` collapses a meeting to a single earned star; this is the raw
 * ledger underneath it, so an officer reconciling a night's roster sees every
 * scan rather than a derived boolean.
 */
export const ATTENDANCE_COLUMNS = [
  "user_id",
  "preferred_name",
  "email",
  "github_login",
  "meeting_config_id",
  "meeting_title",
  "meeting_starts_at",
  "checked_in_at",
  "check_in_method",
  "counts_for_credit",
] as const;

export interface AttendanceFilters {
  from?: Date;
  to?: Date;
  /** Scopes to one meeting. The uuid, not the config id, since this is the
   *  id the officer console already has in hand on a meeting's own page. */
  meetingId?: string;
}

export interface AttendanceRow {
  userId: string;
  preferredName: string | null;
  email: string | null;
  githubLogin: string | null;
  meetingConfigId: string | null;
  meetingTitle: string;
  meetingStartsAt: Date;
  checkedInAt: Date;
  method: "qr" | "manual_code";
  countsForCredit: boolean;
}

export function projectAttendanceRow(row: AttendanceRow): unknown[] {
  return [
    row.userId,
    row.preferredName,
    row.email,
    row.githubLogin,
    row.meetingConfigId,
    row.meetingTitle,
    csvTimestamp(row.meetingStartsAt),
    csvTimestamp(row.checkedInAt),
    row.method,
    row.countsForCredit,
  ];
}

export function parseAttendanceFilters(url: URL): AttendanceFilters {
  const filters: AttendanceFilters = {};
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const meetingId = url.searchParams.get("meetingId");

  if (from && !Number.isNaN(Date.parse(from))) filters.from = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) filters.to = new Date(to);
  if (meetingId) filters.meetingId = meetingId;
  return filters;
}
