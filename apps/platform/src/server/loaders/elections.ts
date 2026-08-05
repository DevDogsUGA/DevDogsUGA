import { and, asc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { canUserVoteAsOfficer } from "~/server/actions/permissions";
import { db } from "~/server/db";
import {
  ballotRankings,
  ballots,
  competitions,
  electionResults,
  elections,
  teamMembers,
  teams,
  tiebreakDisclosures,
} from "~/server/db/schema";

/**
 * Election reads: what is open, who may vote in it, and what it decided.
 *
 * The eligibility question is the interesting one and it is why this is a
 * loader rather than a query in a page. Whether somebody may vote depends on
 * the election's electorate, on their team membership, on a permission, and on
 * whether they have already voted — four facts from four places, and getting
 * any of them wrong shows a ballot to somebody whose vote will be rejected.
 */

export interface ElectionSummary {
  id: string;
  slug: string;
  title: string;
  electorate: "teams" | "officers";
  purpose: "points" | "tiebreak";
  status: "draft" | "open" | "closed" | "tallied";
  opensAt: Date;
  closesAt: Date;
  competitionId: string;
  competitionSlug: string;
}

const summaryColumns = {
  id: elections.id,
  slug: elections.slug,
  title: elections.title,
  electorate: elections.electorate,
  purpose: elections.purpose,
  status: elections.status,
  opensAt: elections.opensAt,
  closesAt: elections.closesAt,
  competitionId: elections.competitionId,
  competitionSlug: competitions.slug,
};

/** Elections accepting ballots right now. */
export const getOpenElections = cache(async (): Promise<ElectionSummary[]> => {
  return db
    .select(summaryColumns)
    .from(elections)
    .innerJoin(competitions, eq(competitions.id, elections.competitionId))
    .where(
      and(
        eq(elections.status, "open"),
        sql`now() between ${elections.opensAt} and ${elections.closesAt}`,
      ),
    )
    .orderBy(asc(elections.closesAt)) as Promise<ElectionSummary[]>;
});

export const getElectionBySlug = cache(
  async (slug: string): Promise<ElectionSummary | null> => {
    const [row] = await db
      .select(summaryColumns)
      .from(elections)
      .innerJoin(competitions, eq(competitions.id, elections.competitionId))
      .where(eq(elections.slug, slug));
    return (row as ElectionSummary) ?? null;
  },
);

/**
 * A competition's tallied points elections.
 *
 * Both filters are load-bearing rather than incidental:
 *
 *   * `purpose = 'points'` keeps the TIEBREAK election out. Publishing its
 *     results would publish the officers' complete ordering — which is exactly
 *     what `tiebreakDisclosures` exists to avoid, by naming only the pairs a
 *     placement actually turned on.
 *   * `status = 'tallied'` keeps out an election whose numbers are not final.
 *     A partial standing shown before the tally is a number people screenshot.
 */
export const getPointsElections = cache(
  async (
    competitionId: string,
  ): Promise<
    { id: string; title: string; electorate: "teams" | "officers" }[]
  > => {
    return db
      .select({
        id: elections.id,
        title: elections.title,
        electorate: elections.electorate,
      })
      .from(elections)
      .where(
        and(
          eq(elections.competitionId, competitionId),
          eq(elections.purpose, "points"),
          eq(elections.status, "tallied"),
        ),
      )
      .orderBy(asc(elections.closesAt)) as Promise<
      { id: string; title: string; electorate: "teams" | "officers" }[]
    >;
  },
);

export type VoteBlock =
  | "not_open"
  | "not_eligible"
  | "already_voted"
  | "no_team"
  | "not_the_lead";

export interface Eligibility {
  canVote: boolean;
  reason: VoteBlock | null;
  /** For a team electorate: the team this ballot would be cast for. */
  teamId: string | null;
}

/**
 * Whether this person may cast this ballot, and why not.
 *
 * Returns a reason rather than a boolean because every one of these is a
 * different sentence on screen. "Voting closed", "you already voted" and
 * "your team lead casts this one" are three completely different things to
 * tell somebody looking at a ballot they cannot submit, and a bare false makes
 * all three read as a bug.
 */
export const getEligibility = cache(
  async (electionId: string, userId: string): Promise<Eligibility> => {
    const [election] = await db
      .select({
        id: elections.id,
        electorate: elections.electorate,
        status: elections.status,
        opensAt: elections.opensAt,
        closesAt: elections.closesAt,
        competitionId: elections.competitionId,
      })
      .from(elections)
      .where(eq(elections.id, electionId));

    if (!election) return block("not_open");

    const now = new Date();
    if (
      election.status !== "open" ||
      now < election.opensAt ||
      now >= election.closesAt
    ) {
      return block("not_open");
    }

    if (election.electorate === "officers") {
      if (!(await canUserVoteAsOfficer(userId))) return block("not_eligible");
      return (await hasVoted(electionId, userId, null))
        ? block("already_voted")
        : { canVote: true, reason: null, teamId: null };
    }

    // A team electorate casts one ballot per team, by the lead. Anyone else on
    // the roster sees the ballot and cannot submit it — which is deliberate:
    // they should know a vote is being cast on their behalf.
    const [membership] = await db
      .select({ teamId: teamMembers.teamId, role: teamMembers.role })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teams.competitionId, election.competitionId),
        ),
      );

    if (!membership) return block("no_team");
    if (membership.role !== "lead") {
      return {
        canVote: false,
        reason: "not_the_lead",
        teamId: membership.teamId,
      };
    }

    return (await hasVoted(electionId, userId, membership.teamId))
      ? { canVote: false, reason: "already_voted", teamId: membership.teamId }
      : { canVote: true, reason: null, teamId: membership.teamId };
  },
);

function block(reason: VoteBlock): Eligibility {
  return { canVote: false, reason, teamId: null };
}

async function hasVoted(
  electionId: string,
  userId: string,
  teamId: string | null,
): Promise<boolean> {
  const [row] = await db
    .select({ id: ballots.id })
    .from(ballots)
    .where(
      and(
        eq(ballots.electionId, electionId),
        teamId === null
          ? eq(ballots.castBy, userId)
          : eq(ballots.teamId, teamId),
      ),
    );
  return row !== undefined;
}

export interface BallotOption {
  teamId: string;
  teamSlug: string;
  teamName: string;
  submissionUrl: string | null;
}

/**
 * The teams on a ballot.
 *
 * A voter's own team is included rather than filtered out. Borda is a ranking
 * of the whole field, and removing one entry from one voter's ballot changes
 * how many points every other position is worth on it — which would quietly
 * make a self-ranking voter's ballot count differently from everybody else's.
 * Whether ranking your own team first is allowed is a rule for the tally, not
 * a reason to hand out ballots of different lengths.
 */
export const getBallotOptions = cache(
  async (competitionId: string): Promise<BallotOption[]> => {
    return db
      .select({
        teamId: teams.id,
        teamSlug: teams.slug,
        teamName: teams.name,
        submissionUrl: teams.submissionUrl,
      })
      .from(teams)
      .where(
        and(
          eq(teams.competitionId, competitionId),
          // Only entries. A team that never submitted has nothing to judge,
          // and putting it on the ballot invites voters to rank an absence.
          sql`${teams.submissionState} is not null`,
        ),
      )
      .orderBy(asc(teams.name));
  },
);

/** A ballot already cast, so the voter can see what they submitted. */
export const getMyBallot = cache(
  async (
    electionId: string,
    userId: string,
  ): Promise<{ teamId: string; rank: number }[]> => {
    return db
      .select({
        teamId: ballotRankings.candidateTeamId,
        rank: ballotRankings.rank,
      })
      .from(ballotRankings)
      .innerJoin(ballots, eq(ballots.id, ballotRankings.ballotId))
      .where(
        and(eq(ballots.electionId, electionId), eq(ballots.castBy, userId)),
      )
      .orderBy(asc(ballotRankings.rank));
  },
);

export interface ElectionResultRow {
  teamId: string;
  teamName: string;
  bordaScore: number;
  /** The Borda score normalised against the ceiling, not the field. */
  scaled: string;
  placement: number;
}

/** What an election decided, once it has been tallied. */
export const getElectionResults = cache(
  async (electionId: string): Promise<ElectionResultRow[]> => {
    return db
      .select({
        teamId: electionResults.teamId,
        teamName: teams.name,
        bordaScore: electionResults.bordaScore,
        scaled: electionResults.scaled,
        placement: electionResults.placement,
      })
      .from(electionResults)
      .innerJoin(teams, eq(teams.id, electionResults.teamId))
      .where(eq(electionResults.electionId, electionId))
      .orderBy(asc(electionResults.placement)) as Promise<ElectionResultRow[]>;
  },
);

/**
 * Every tiebreak that decided a placement, for the competition's results page.
 *
 * Disclosed rather than merely recorded. A placement settled by a tiebreak
 * looks identical to one settled outright, and a team that lost on a
 * tiebreaker is owed the fact that it was one — that is the whole reason the
 * table exists rather than the tally just writing an order.
 */
export const getTiebreakDisclosures = cache(async (competitionId: string) => {
  return db
    .select({
      higherTeamId: tiebreakDisclosures.higherTeamId,
      lowerTeamId: tiebreakDisclosures.lowerTeamId,
    })
    .from(tiebreakDisclosures)
    .where(eq(tiebreakDisclosures.competitionId, competitionId));
});
