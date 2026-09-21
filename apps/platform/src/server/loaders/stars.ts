import { asc, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import { competitions, memberStars } from "~/server/db/schema";

export type StarActivityType = "meeting" | "competition";

/** One earned meeting or competition star. */
export interface StarCell {
  activityType: StarActivityType;
  activityId: string;
  meetingId: string | null;
  competitionId: string | null;
  startsAt: Date;
  earnedAt: Date;
  label: string;
  won: boolean;
}

export const getStarsForUser = cache(
  async (userId: string): Promise<StarCell[]> => {
    const rows = await db
      .select({
        activityType: sql<StarActivityType>`${memberStars.activityType}`,
        activityId: memberStars.activityId,
        meetingId: memberStars.meetingId,
        competitionId: memberStars.competitionId,
        startsAt: memberStars.startsAt,
        earnedAt: memberStars.earnedAt,
        won: memberStars.won,
        label: sql<string>`case
          when ${memberStars.activityType} = 'meeting' then coalesce(
            (select m."nameOverride" from platform.meetings m where m.id = ${memberStars.meetingId}),
            (select m.kind from platform.meetings m where m.id = ${memberStars.meetingId}),
            'Meeting'
          )
          else coalesce(
            (select c.title from platform.competitions c where c.id = ${memberStars.competitionId}),
            (
              select w.title
              from platform.competitions c
              join platform.workshops w on w.id = c."workshopId"
              where c.id = ${memberStars.competitionId}
            ),
            (select c.slug from platform.competitions c where c.id = ${memberStars.competitionId}),
            'Competition'
          )
        end`,
      })
      .from(memberStars)
      .where(eq(memberStars.userId, userId))
      .orderBy(desc(memberStars.startsAt), asc(memberStars.activityType));

    return rows.map((row) => ({
      activityType: row.activityType,
      activityId: row.activityId!,
      meetingId: row.meetingId,
      competitionId: row.competitionId,
      startsAt: row.startsAt!,
      earnedAt: row.earnedAt!,
      label: row.label,
      won: row.won!,
    }));
  },
);

export interface StarTotals {
  meetingStars: number;
  competitionStars: number;
  wins: number;
}

export function totalStars(cells: StarCell[]): StarTotals {
  return {
    meetingStars: cells.filter((cell) => cell.activityType === "meeting")
      .length,
    competitionStars: cells.filter(
      (cell) => cell.activityType === "competition",
    ).length,
    wins: cells.filter((cell) => cell.won).length,
  };
}

/** Competition participation for the workshop page's roster. */
export const getStarsForWorkshop = cache(
  async (
    workshopId: string,
  ): Promise<
    {
      userId: string;
      workshopStar: boolean;
      competitionStar: boolean;
      won: boolean;
    }[]
  > => {
    const rows = await db
      .select({ userId: memberStars.userId, won: memberStars.won })
      .from(memberStars)
      .innerJoin(competitions, eq(competitions.id, memberStars.competitionId))
      .where(eq(competitions.workshopId, workshopId))
      .orderBy(asc(memberStars.userId));

    return rows.map((row) => ({
      userId: row.userId!,
      workshopStar: false,
      competitionStar: true,
      won: row.won!,
    }));
  },
);
