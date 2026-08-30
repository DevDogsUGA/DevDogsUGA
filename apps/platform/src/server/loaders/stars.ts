import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import { meetings, memberStars, projects, workshops } from "~/server/db/schema";

/**
 * Star reads, for the profile badge row and the participation grid.
 *
 * Stars are derived: `memberStars` is a view, not a table. An officer
 * correcting an attendance row changes the stars everywhere at once, with
 * nothing to recompute and nothing that can fall out of step.
 *
 * The view is `security_invoker`, so these reads see exactly what the caller
 * is allowed to see. A member's participation record is public but the
 * attendance rows underneath it are not.
 */

export interface StarCell {
  workshopId: string;
  meetingId: string;
  meetingSlug: string;
  /**
   * The night's own name, and the officer's kind for it. Both null on an
   * ordinary sprint Monday.
   *
   * ⚠️ These replaced a `meetingName` column that coalesced through the
   * WORKSHOP's title, a per-workshop value used as a per-meeting heading.
   * `groupByMeeting` keeps whichever row arrives first and `getStarsForUser`
   * orders only by `desc(meetings.startsAt)` with no tiebreaker, so a member
   * who attended "Supabase" and "Next.js" on one unnamed Monday got one of the
   * two as the heading, chosen arbitrarily and able to change between
   * requests. It stuttered against the row beneath it: "Supabase / Supabase ★
   * / Next.js ★".
   *
   * `meetingTitle` composes the heading from all of a night's cells instead:
   * "Workshop: Supabase & Next.js".
   */
  meetingNameOverride: string | null;
  meetingKind: string | null;
  meetingStartsAt: Date;
  /**
   * The officer's word for the session. With `projectName`, this is exactly
   * `TitleableWorkshop`, so a cell can go straight to `workshopLabel` instead
   * of repeating its fallback here.
   */
  title: string | null;
  /**
   * All three are null for a workshop that teaches a skill rather than a
   * codebase. `workshops.projectId` is nullable and the join below is a left
   * one, so such a star reaches the member's record instead of vanishing from
   * it.
   */
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
  workshopStar: boolean;
  competitionStar: boolean;
  won: boolean;
}

const cellColumns = {
  workshopId: memberStars.workshopId,
  meetingId: memberStars.meetingId,
  meetingSlug: meetings.slug,
  // The two per-MEETING naming columns, carried as themselves rather than
  // pre-coalesced with a per-workshop one. `meetingTitle` composes the
  // heading; doing it in SQL is what made the old column pick an arbitrary
  // workshop and call it the night. Still nullable rather than falling back to
  // a formatted date here, because that would put `EVENT_TZ` in a second
  // place as a string literal no typechecker relates to `lib/eventTime`.
  meetingNameOverride: meetings.nameOverride,
  meetingKind: meetings.kind,
  meetingStartsAt: meetings.startsAt,
  title: workshops.title,
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
 * Only rows where something was earned exist at all. The view is built from
 * participation, so a meeting somebody skipped produces no row rather than a
 * row of falses. The grid fills the gaps; the query does not carry them.
 */
export const getStarsForUser = cache(
  async (userId: string): Promise<StarCell[]> => {
    const rows = await db
      .select(cellColumns)
      .from(memberStars)
      .innerJoin(meetings, eq(meetings.id, memberStars.meetingId))
      .innerJoin(workshops, eq(workshops.id, memberStars.workshopId))
      // Left: `workshops.projectId` is nullable, so a member who attended a
      // skill session like career-fair readiness has a real star whose row an
      // inner join would delete from their own record.
      .leftJoin(projects, eq(projects.id, memberStars.projectId))
      .where(
        and(
          eq(memberStars.userId, userId),
          isNull(meetings.deletedAt),
          isNull(workshops.deletedAt),
        ),
      )
      .orderBy(desc(meetings.startsAt));

    // Named one at a time rather than `as Promise<StarCell[]>` over the whole
    // chain. A cast on the chain covers EVERY column, including the genuinely
    // nullable ones, so a later widening of `StarCell` would be absorbed by it
    // in silence.
    //
    // These five are the ones Postgres cannot prove and the joins above can:
    // `memberStars` is a view, so every column comes back optional, while the
    // two inner joins mean a row only exists when its workshop and meeting do,
    // and `bool_or` over a non-empty group is never null. `projectId`,
    // `projectSlug`, `projectName`, `title` and the two naming columns are
    // nullable for real and pass through untouched.
    return rows.map((row) => ({
      ...row,
      workshopId: row.workshopId!,
      meetingId: row.meetingId!,
      workshopStar: row.workshopStar!,
      competitionStar: row.competitionStar!,
      won: row.won!,
    }));
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
 * This is the participation matrix column, not the attendance list. A member
 * who skipped the workshop and competed anyway appears here, because competing
 * earns the workshop star, with no attendance row behind them. The design
 * keeps that ambiguity out of Airtable.
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
