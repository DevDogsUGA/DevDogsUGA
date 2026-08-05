import { asc, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import {
  competitions,
  competitionStandings,
  memberPoints,
  profiles,
  teamMembers,
  teams,
} from "~/server/db/schema";

/**
 * Points reads: one competition's standings, and a member's running total.
 *
 * Everything here is downstream of the tally. `competitionStandings` rows
 * exist only once a competition has been finalized, which is the same fact the
 * sync's `requirementCount` refusal keys on — so an empty result means "not
 * scored yet" rather than "scored zero", and the UI has to say so.
 */

export interface StandingRow {
  teamId: string;
  teamSlug: string;
  teamName: string;
  placement: number;
  requirementsMet: number;
  requirementCount: number;
  requirementPoints: number;
  electionPoints: number;
  totalPoints: number;
  /** Set when a tiebreak decided this placement. Named so the page can say so. */
  resolvedBy: string | null;
  memberCount: number;
}

/**
 * One competition's final standings, best first.
 *
 * Ordered by placement rather than by points: a tiebreak can put two teams on
 * identical totals in a deliberate order, and sorting by points would silently
 * re-tie them on screen after the whole tiebreak apparatus was run to separate
 * them.
 */
export const getStandings = cache(
  async (competitionSlug: string): Promise<StandingRow[]> => {
    return db
      .select({
        teamId: competitionStandings.teamId,
        teamSlug: teams.slug,
        teamName: teams.name,
        placement: competitionStandings.placement,
        requirementsMet: competitionStandings.requirementsMet,
        requirementCount: competitionStandings.requirementCount,
        requirementPoints: competitionStandings.requirementPoints,
        electionPoints: competitionStandings.electionPoints,
        totalPoints: competitionStandings.totalPoints,
        resolvedBy: competitionStandings.resolvedBy,
        memberCount: sql<number>`(
          select count(*)::int from ${teamMembers}
          where ${teamMembers.teamId} = ${competitionStandings.teamId}
        )`,
      })
      .from(competitionStandings)
      .innerJoin(teams, eq(teams.id, competitionStandings.teamId))
      .innerJoin(
        competitions,
        eq(competitions.id, competitionStandings.competitionId),
      )
      .where(eq(competitions.slug, competitionSlug))
      .orderBy(asc(competitionStandings.placement)) as Promise<StandingRow[]>;
  },
);

export interface MemberPointsRow {
  userId: string;
  preferredName: string | null;
  lifetimePoints: number;
  competitionsScored: number;
}

/**
 * The points leaderboard.
 *
 * `memberPoints` is a `security_invoker` view over the standings, so it shows
 * only competitions the caller may see — which for a member is every finalized
 * one and nothing in progress. That is the correct answer rather than a
 * limitation: a partial standing shown before the tally is a number people
 * will screenshot.
 */
export const getMemberPointsLeaderboard = cache(
  async (limit = 50): Promise<MemberPointsRow[]> => {
    return db
      .select({
        userId: memberPoints.userId,
        preferredName: profiles.preferredName,
        lifetimePoints: memberPoints.lifetimePoints,
        competitionsScored: memberPoints.competitionsScored,
      })
      .from(memberPoints)
      .leftJoin(profiles, eq(profiles.userId, memberPoints.userId))
      .orderBy(desc(memberPoints.lifetimePoints))
      .limit(limit) as Promise<MemberPointsRow[]>;
  },
);

/**
 * One member's total, for their profile.
 *
 * Zero and "never scored" are the same number and deliberately not
 * distinguished here — a member with no finalized competition has earned
 * nothing yet, and the profile says "0 points" rather than hiding the row.
 * `competitionsScored` is what tells them apart when a caller needs to.
 */
export const getMemberPoints = cache(
  async (
    userId: string,
  ): Promise<{ lifetimePoints: number; competitionsScored: number }> => {
    const [row] = await db
      .select({
        lifetimePoints: memberPoints.lifetimePoints,
        competitionsScored: memberPoints.competitionsScored,
      })
      .from(memberPoints)
      .where(eq(memberPoints.userId, userId));
    return {
      lifetimePoints: row?.lifetimePoints ?? 0,
      competitionsScored: row?.competitionsScored ?? 0,
    };
  },
);
