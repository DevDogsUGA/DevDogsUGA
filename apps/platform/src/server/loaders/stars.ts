import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import { meetings, memberStars, projects, workshops } from "~/server/db/schema";

/**
 * Star reads, for the profile badge row and the participation grid.
 *
 * Stars are derived — `memberStars` is a view, not a table — which is what
 * makes the whole design work: an officer correcting an attendance row changes
 * the stars immediately and everywhere, with nothing to recompute and nothing
 * that can fall out of step.
 *
 * The view is `security_invoker`, so these reads see exactly what the caller
 * is allowed to see. That matters because a member's participation record is
 * public but the attendance rows underneath it are not.
 */

export interface StarCell {
  workshopId: string;
  meetingId: string;
  meetingSlug: string;
  meetingName: string;
  meetingStartsAt: Date;
  projectId: string;
  projectSlug: string;
  projectName: string;
  workshopStar: boolean;
  competitionStar: boolean;
  won: boolean;
}

const cellColumns = {
  workshopId: memberStars.workshopId,
  meetingId: memberStars.meetingId,
  meetingSlug: meetings.slug,
  /**
   * What to call the night, or null when nothing was authored.
   *
   * `nameOverride` is null for an ordinary sprint Monday, so this coalesces
   * through the labels that do exist — and the workshop's own title is the
   * better one here anyway, since this is a per-workshop row and "Supabase"
   * says more than a date the next column already shows.
   *
   * Deliberately still nullable rather than coalescing to a formatted date in
   * SQL: that would put `EVENT_TZ` in a second place, as a string literal no
   * typechecker relates to `lib/eventTime`. The consumer has
   * `meetingStartsAt` and formats it there.
   */
  meetingName: sql<
    string | null
  >`coalesce(${meetings.nameOverride}, ${workshops.title}, ${projects.displayName})`,
  meetingStartsAt: meetings.startsAt,
  projectId: memberStars.projectId,
  projectSlug: projects.slug,
  projectName: projects.displayName,
  workshopStar: memberStars.workshopStar,
  competitionStar: memberStars.competitionStar,
  won: memberStars.won,
};

/**
 * One member's record, newest first.
 *
 * Only rows where something was earned exist at all — the view is built from
 * participation, so a meeting somebody skipped produces no row rather than a
 * row of falses. The grid fills the gaps; the query does not carry them.
 */
export const getStarsForUser = cache(
  async (userId: string): Promise<StarCell[]> => {
    return (
      db
        .select(cellColumns)
        .from(memberStars)
        .innerJoin(meetings, eq(meetings.id, memberStars.meetingId))
        .innerJoin(workshops, eq(workshops.id, memberStars.workshopId))
        // Left: `workshops.projectId` is nullable, so a member who attended a
        // skill session — career-fair readiness, say — has a real star whose
        // row an inner join would delete from their own record.
        .leftJoin(projects, eq(projects.id, memberStars.projectId))
        .where(
          and(
            eq(memberStars.userId, userId),
            isNull(meetings.deletedAt),
            isNull(workshops.deletedAt),
          ),
        )
        // The view's columns are nullable because Postgres cannot prove a view
        // column NOT NULL. Every row here comes from a join on the underlying
        // rows, so the nulls are unreachable — asserted once here rather than
        // pushed onto every caller.
        .orderBy(desc(meetings.startsAt)) as Promise<StarCell[]>
    );
  },
);

export interface StarTotals {
  workshopStars: number;
  competitionStars: number;
  wins: number;
}

/** The three counts a profile badge row shows. */
export function totalStars(cells: StarCell[]): StarTotals {
  return {
    workshopStars: cells.filter((c) => c.workshopStar).length,
    competitionStars: cells.filter((c) => c.competitionStar).length,
    wins: cells.filter((c) => c.won).length,
  };
}

/**
 * Every star earned at one workshop, for the workshop page's roster.
 *
 * Note this is the participation matrix column, not the attendance list. A
 * member who skipped the workshop and competed anyway appears here — competing
 * earns the workshop star — with no attendance row behind them. That is the
 * ambiguity the design deliberately keeps out of Airtable, and it is correct
 * in both places precisely because neither is trying to be the other.
 */
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
    return db
      .select({
        userId: memberStars.userId,
        workshopStar: memberStars.workshopStar,
        competitionStar: memberStars.competitionStar,
        won: memberStars.won,
      })
      .from(memberStars)
      .where(eq(memberStars.workshopId, workshopId))
      .orderBy(asc(memberStars.userId)) as Promise<
      {
        userId: string;
        workshopStar: boolean;
        competitionStar: boolean;
        won: boolean;
      }[]
    >;
  },
);
