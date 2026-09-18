import { and, asc, desc, isNull, lte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { meetings } from "~/server/db/schema";

export type AttendanceMeeting = {
  id: string;
  nameOverride: string | null;
  kind: string | null;
  startsAt: Date;
  endsAt: Date;
  ongoing: boolean;
};

/** Past and currently running meetings, with the specified default first. */
export async function getAttendanceMeetings(
  now: Date = new Date(),
): Promise<AttendanceMeeting[]> {
  const nowIso = now.toISOString();
  // Raw SQL values do not inherit the timestamp column's Date encoder, so the
  // shared expression uses an ISO string with an explicit Postgres cast.
  const ongoing = sql<boolean>`${meetings.startsAt} <= ${nowIso}::timestamptz and ${meetings.endsAt} >= ${nowIso}::timestamptz`;
  return db
    .select({
      id: meetings.id,
      nameOverride: meetings.nameOverride,
      kind: meetings.kind,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      ongoing,
    })
    .from(meetings)
    .where(
      and(
        isNull(meetings.deletedAt),
        isNull(meetings.cancelledAt),
        lte(meetings.startsAt, now),
      ),
    )
    .orderBy(
      sql`case when ${ongoing} then 0 else 1 end`,
      sql`case when ${ongoing} then ${meetings.startsAt} end asc`,
      sql`case when ${ongoing} then ${meetings.endsAt} end asc`,
      sql`case when ${ongoing} then ${meetings.id} end asc`,
      desc(meetings.startsAt),
      asc(meetings.id),
    );
}
