import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * The one credit rule (Q165): a meeting counts for streaks, reflections, EL
 * credit and stars when it links at least one reusable workshop definition.
 * The rule itself lives in the `platform.meeting_has_workshop` SQL function
 * (supabase/schemas/platform/functions/meeting_has_workshop.sql); this wraps
 * it for any query that has the meeting's id in hand, e.g.
 * `meetingHasWorkshop(sql`m.id`)` or `meetingHasWorkshop(meetings.id)`.
 */
export function meetingHasWorkshop(meetingId: SQLWrapper): SQL<boolean> {
  return sql<boolean>`platform.meeting_has_workshop(${meetingId})`;
}
