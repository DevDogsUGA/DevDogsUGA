import { and, eq, isNull } from "drizzle-orm";
import { categoryOf } from "~/lib/eventKind";
import { meetingTitle } from "~/lib/meetingTitle";
import {
  meetingSubjects,
  type GraphicRevision,
  type GraphicSubject,
} from "~/lib/graphics/subjects";
import { seriesKicker } from "~/server/config/seriesKicker";
import { meetingBrand } from "~/server/config/meetingBrand";
import { db } from "~/server/db";
import { meetings } from "~/server/db/schema";
import { getMeetingWorkshops } from "~/server/loaders/meetings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GraphicsMeeting {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  cancelled: boolean;
  subjects: GraphicSubject[];
}

/**
 * One meeting and everything the console can draw of it.
 *
 * Null for an unknown, archived or malformed id, so a route answers 404 and
 * never a database error for a hand-typed URL.
 *
 * `revision` is the personal-revision seam (see `meetingSubjects`); callers
 * pass nothing until C2 stores revisions.
 */
export async function getGraphicsMeeting(
  meetingId: string,
  revision?: GraphicRevision,
): Promise<GraphicsMeeting | null> {
  if (!UUID.test(meetingId)) return null;

  const [row] = await db
    .select({
      id: meetings.id,
      slug: meetings.slug,
      nameOverride: meetings.nameOverride,
      series: meetings.series,
      category: meetings.category,
      building: meetings.building,
      location: meetings.location,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      cancelledAt: meetings.cancelledAt,
      cancellationReason: meetings.cancellationReason,
    })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), isNull(meetings.deletedAt)))
    .limit(1);
  if (!row) return null;

  const cancelled = row.cancelledAt !== null;
  // A cancelled night draws no agenda, and no workshop poster for a workshop
  // that is not happening.
  const workshops = cancelled ? [] : await getMeetingWorkshops(row.id);
  const title = meetingTitle(row, workshops);

  const subjects = meetingSubjects({
    meeting: {
      ...row,
      category: categoryOf(row),
      brand: meetingBrand(row.slug),
      kicker: seriesKicker(row.series, title),
    },
    title,
    workshops,
    revision,
  });

  return {
    id: row.id,
    slug: row.slug,
    title,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    cancelled,
    subjects,
  };
}
