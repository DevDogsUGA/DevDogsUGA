import { and, eq, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  ballotRankings,
  ballots,
  competitionStandings,
  competitions,
  electionResults,
  elections,
  pairwiseTallies,
  teamAwards,
  teams,
  tiebreakDisclosures,
} from "~/server/db/schema";
import { borda, copeland, standings, type Ballot, type TeamId } from "./tally";

/**
 * The tally pass.
 *
 * Every five minutes: Borda each election whose voting has closed, then
 * finalize each competition whose elections have all been tallied.
 *
 * Two properties it has to hold, both of which are about what happens on the
 * SECOND run rather than the first:
 *
 *   - Idempotent. A re-run over an already-tallied election is a no-op, not a
 *     second winner row. `status = 'open'` is the guard for elections, and the
 *     existing standings rows are the guard for competitions.
 *   - Blocks rather than guesses. A missing tiebreak ballot or an ungraded
 *     competition surfaces as an explicit state; neither is defaulted, which
 *     would publish a wrong winner rather than a visible gap.
 *
 * Deliberately separate from the judging-start pass even though both run every
 * five minutes: this one blocks on grading, and freezing participation must
 * happen whether or not grading is done.
 */
export interface TallyReport {
  electionsTallied: number;
  competitionsFinalized: number;
  blocked: { competitionId: string; reason: string }[];
}

export async function runTally(): Promise<TallyReport> {
  const electionsTallied = await tallyClosedElections();
  const { finalized, blocked } = await finalizeCompetitions();
  return {
    electionsTallied,
    competitionsFinalized: finalized,
    blocked,
  };
}

/** Loads every ballot for an election as a plain ranking. */
async function loadBallots(electionId: string): Promise<Ballot[]> {
  const rows = await db
    .select({
      ballotId: ballots.id,
      rank: ballotRankings.rank,
      candidateTeamId: ballotRankings.candidateTeamId,
    })
    .from(ballots)
    .innerJoin(ballotRankings, eq(ballotRankings.ballotId, ballots.id))
    .where(eq(ballots.electionId, electionId));

  const byBallot = new Map<string, { rank: number; teamId: TeamId }[]>();
  for (const row of rows) {
    const list = byBallot.get(row.ballotId) ?? [];
    list.push({ rank: row.rank, teamId: row.candidateTeamId });
    byBallot.set(row.ballotId, list);
  }

  return [...byBallot.values()].map((entries) => ({
    ranking: entries
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.teamId),
  }));
}

async function competingTeams(competitionId: string): Promise<TeamId[]> {
  const rows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.competitionId, competitionId));
  return rows.map((r) => r.id);
}

async function tallyClosedElections(): Promise<number> {
  const due = await db
    .select({
      id: elections.id,
      competitionId: elections.competitionId,
      purpose: elections.purpose,
    })
    .from(elections)
    .where(
      and(eq(elections.status, "open"), lt(elections.closesAt, sql`now()`)),
    );

  let tallied = 0;

  for (const election of due) {
    const candidates = await competingTeams(election.competitionId);
    const cast = await loadBallots(election.id);

    await db.transaction(async (tx) => {
      // The tiebreak election writes NO electionResults rows at all. It awards
      // no points and exists only to be a complete ordering, so there is
      // nothing here for a policy to have to exclude — which is why the rule
      // is enforced here and asserted in a test, rather than left to nobody
      // adding the obvious insert later.
      if (election.purpose === "points" && candidates.length > 0) {
        const results = borda(cast, candidates);
        await tx.insert(electionResults).values(
          results.map((r) => ({
            electionId: election.id,
            teamId: r.teamId,
            placement: r.placement,
            bordaScore: r.score,
            // Scaling happens here rather than as a generated column, so the
            // numbers a team sees come from the code the tests cover.
            scaled: r.scaled.toFixed(9),
          })),
        );
      }

      await tx
        .update(elections)
        .set({ status: "tallied" })
        .where(eq(elections.id, election.id));
    });

    tallied += 1;
  }

  return tallied;
}

async function finalizeCompetitions(): Promise<{
  finalized: number;
  blocked: { competitionId: string; reason: string }[];
}> {
  // A competition is ready when it has at least one election and none of them
  // is still open or draft.
  const candidates = await db
    .selectDistinct({ id: elections.competitionId })
    .from(elections);

  let finalized = 0;
  const blocked: { competitionId: string; reason: string }[] = [];

  for (const { id: competitionId } of candidates) {
    const all = await db
      .select({
        id: elections.id,
        purpose: elections.purpose,
        status: elections.status,
      })
      .from(elections)
      .where(eq(elections.competitionId, competitionId));

    if (all.some((e) => e.status !== "tallied")) continue;

    // Already finalized: the standings rows are the guard that makes a re-run
    // a no-op rather than a second winner.
    const [existing] = await db
      .select({ teamId: competitionStandings.teamId })
      .from(competitionStandings)
      .where(eq(competitionStandings.competitionId, competitionId))
      .limit(1);
    if (existing) continue;

    const [competition] = await db
      .select({ requirementCount: competitions.requirementCount })
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .limit(1);
    if (!competition) continue;

    const teamRows = await db
      .select({ id: teams.id, requirementsMet: teams.requirementsMet })
      .from(teams)
      .where(eq(teams.competitionId, competitionId));
    if (teamRows.length === 0) continue;

    const pointsElections = all.filter((e) => e.purpose === "points");
    const tiebreakElection = all.find((e) => e.purpose === "tiebreak");

    const tallied = [];
    const pooled: Ballot[] = [];
    for (const election of pointsElections) {
      const rows = await db
        .select({
          teamId: electionResults.teamId,
          scaled: electionResults.scaled,
        })
        .from(electionResults)
        .where(eq(electionResults.electionId, election.id));

      tallied.push({
        electionId: election.id,
        results: rows.map((r) => ({
          teamId: r.teamId,
          scaled: Number(r.scaled),
        })),
      });
      // Pooled for Copeland. The tiebreak is excluded on purpose: it is step 3,
      // and pooling it into step 2 would leave both steps reading one input.
      pooled.push(...(await loadBallots(election.id)));
    }

    const tiebreakBallots = tiebreakElection
      ? await loadBallots(tiebreakElection.id)
      : [];

    const outcome = standings({
      teams: teamRows.map((t) => t.id),
      requirementCount: competition.requirementCount,
      grades: teamRows.map((t) => ({
        teamId: t.id,
        requirementsMet: t.requirementsMet,
      })),
      elections: tallied,
      pooledBallots: pooled,
      tiebreak: tiebreakBallots[0] ?? null,
    });

    if (outcome.status === "blocked") {
      blocked.push({ competitionId, reason: outcome.reason });
      continue;
    }

    const matrix = copeland(
      pooled,
      teamRows.map((t) => t.id),
    );

    // One transaction, so a partial tally cannot be observed.
    await db.transaction(async (tx) => {
      await tx.insert(competitionStandings).values(
        outcome.standings.map((s) => ({
          competitionId,
          teamId: s.teamId,
          requirementsMet: s.requirementsMet,
          requirementCount: s.requirementCount,
          requirementPoints: s.requirementPoints,
          electionPoints: s.electionPoints,
          placement: s.placement,
          resolvedBy: s.resolvedBy,
        })),
      );

      if (matrix.pairs.length > 0) {
        await tx.insert(pairwiseTallies).values(
          matrix.pairs.map((p) => ({
            competitionId,
            teamA: p.teamA,
            teamB: p.teamB,
            aOverB: p.aOverB,
            bOverA: p.bOverA,
          })),
        );
      }

      if (outcome.disclosures.length > 0) {
        await tx.insert(tiebreakDisclosures).values(
          outcome.disclosures.map((d) => ({
            competitionId,
            higherTeamId: d.higherTeamId,
            lowerTeamId: d.lowerTeamId,
          })),
        );
      }

      // The winner row is WRITTEN by the tally, not authored by anyone.
      // Officers still author named side awards, because an honourable
      // mention is a judgement rather than a sum.
      const winner = outcome.standings.find((s) => s.placement === 1);
      if (winner) {
        await tx
          .insert(teamAwards)
          .values({
            teamId: winner.teamId,
            competitionId,
            category: "winner",
            // Null, not a sentinel: this row is the arithmetic, and there is
            // no officer to name. See migration 20260803000011.
            awardedBy: null,
          })
          .onConflictDoNothing();
      }
    });

    finalized += 1;
  }

  return { finalized, blocked };
}

/**
 * Competitions that need officer attention, for the console.
 *
 * These are the two states the tally refuses to finalize through, surfaced
 * where somebody can act on them rather than left in a cron log.
 */
export async function blockedCompetitions(): Promise<{
  ungraded: string[];
  missingTiebreak: string[];
}> {
  // Ungraded: no requirement count on the competition, or any team without a
  // grade. Both are the same data-entry gap from an officer's point of view.
  const ungradedRows = await db
    .selectDistinct({ id: competitions.id })
    .from(competitions)
    .leftJoin(teams, eq(teams.competitionId, competitions.id))
    .where(
      or(isNull(competitions.requirementCount), isNull(teams.requirementsMet)),
    );

  // A competition whose points elections have all been tallied but whose
  // tiebreak has not. That is the state where a tie would block, and it is
  // the one somebody will forget precisely because it usually is not needed.
  const withTiebreak = db
    .selectDistinct({ id: elections.competitionId })
    .from(elections)
    .where(
      and(eq(elections.purpose, "tiebreak"), eq(elections.status, "tallied")),
    );

  const missingRows = await db
    .selectDistinct({ id: elections.competitionId })
    .from(elections)
    .where(
      and(
        eq(elections.purpose, "points"),
        eq(elections.status, "tallied"),
        notInArray(elections.competitionId, withTiebreak),
      ),
    );

  return {
    ungraded: ungradedRows.map((r) => r.id),
    missingTiebreak: missingRows.map((r) => r.id),
  };
}
