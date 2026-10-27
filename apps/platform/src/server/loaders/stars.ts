import { and, asc, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import { memberStars } from "~/server/db/schema";

/**
 * One earned meeting star.
 *
 * `platform."memberStars"` once also returned a competition row per entered
 * competition. Competitions are gone, so this reads the meeting rows only; the
 * view's competition branch leaves with the table drop.
 */
export interface StarCell {
  meetingId: string;
  startsAt: Date;
  earnedAt: Date;
  label: string;
}

export const getStarsForUser = cache(
  async (userId: string): Promise<StarCell[]> => {
    const rows = await db
      .select({
        meetingId: memberStars.meetingId,
        startsAt: memberStars.startsAt,
        earnedAt: memberStars.earnedAt,
        label: sql<string>`coalesce(
          (select m."nameOverride" from platform.meetings m where m.id = ${memberStars.meetingId}),
          'Meeting'
        )`,
      })
      .from(memberStars)
      .where(
        and(
          eq(memberStars.userId, userId),
          eq(memberStars.activityType, "meeting"),
        ),
      )
      .orderBy(desc(memberStars.startsAt), asc(memberStars.activityId));

    return rows.map((row) => ({
      meetingId: row.meetingId!,
      startsAt: row.startsAt!,
      earnedAt: row.earnedAt!,
      label: row.label,
    }));
  },
);

export interface StarTotals {
  meetingStars: number;
}

export function totalStars(cells: StarCell[]): StarTotals {
  return { meetingStars: cells.length };
}
