/**
 * The election tally: Borda, Copeland, scoring, and the standings chain.
 *
 * Pure functions over plain arrays, with no database access anywhere in this
 * file. That is what made it safe to move out of Postgres. The tally reads its
 * inputs, computes, and writes, none of which needs to happen in the database
 * to be correct, and all of which is easier to test as functions over arrays
 * than as PL/pgSQL.
 *
 * What stays in the database is every constraint the tally writes against: the
 * tiebreak's partial unique index, the `scaled` range check, and the
 * one-winner-per-competition index. Those are what make a buggy tally fail
 * loudly instead of publishing a second winner.
 */

export type TeamId = string;

/** A complete ranking. Index 0 is the first preference. */
export interface Ballot {
  ranking: TeamId[];
}

export interface BordaResult {
  teamId: TeamId;
  /** Raw Borda points: (n - 1) for a first preference, 0 for last. */
  score: number;
  /** score / (V x (n - 1)), in [0, 1]. */
  scaled: number;
  /** Ties share a placement, and legitimately so. See `standings`. */
  placement: number;
}

/** The whole competition is scored out of this. */
export const TOTAL_CEILING = 1000;
/** Objective block: a team that does the work earns these regardless of others. */
export const REQUIREMENT_CEILING = 600;
/** Comparative block: earnable only at another team's expense. */
export const ELECTION_CEILING = 400;

/**
 * Borda count over complete ballots.
 *
 * `scaled` normalizes against the CEILING (what a team ranked first on every
 * ballot would score), not against the field. Min-max scaling, where the leader
 * takes the full share and the trailer zero, was rejected: it is undefined when
 * every team ties, and it manufactures a decisive result from noise, spreading
 * five teams within one Borda point of each other across the entire block.
 *
 * Normalizing against the ceiling means margins survive. Teams that finish
 * close together score close together.
 */
export function borda(ballots: Ballot[], candidates: TeamId[]): BordaResult[] {
  const n = candidates.length;
  const v = ballots.length;
  const raw = new Map<TeamId, number>(candidates.map((id) => [id, 0]));

  for (const ballot of ballots) {
    ballot.ranking.forEach((teamId, index) => {
      if (!raw.has(teamId)) return;
      raw.set(teamId, raw.get(teamId)! + (n - 1 - index));
    });
  }

  // A one-team competition has no ceiling to normalize against (n - 1 = 0), and
  // neither does an election nobody voted in. Both are reachable rather than
  // defensive: competitions with fewer than two teams skip elections entirely.
  const ceiling = v * (n - 1);

  const scored = candidates.map((teamId) => ({
    teamId,
    score: raw.get(teamId)!,
    scaled: ceiling === 0 ? 0 : raw.get(teamId)! / ceiling,
  }));

  return assignPlacements(scored, (r) => r.score).map((r) => ({
    teamId: r.teamId,
    score: r.score,
    scaled: r.scaled,
    placement: r.placement,
  }));
}

export interface PairwiseEntry {
  teamA: TeamId;
  teamB: TeamId;
  aOverB: number;
  bOverA: number;
}

export interface CopelandResult {
  pairs: PairwiseEntry[];
  /** Wins minus losses, per team. */
  scores: Map<TeamId, number>;
}

/**
 * Copeland over pooled ballots.
 *
 * Step 2 pools every ballot from every POINTS election, team-voted and
 * officer-voted alike, rather than running on a dedicated ballot. Teams have
 * already stated their preferences several times over, and asking again adds
 * fatigue without adding information.
 *
 * The tiebreak ballot is excluded by the caller. It is step 3, and pooling it
 * here would leave the two steps reading the same input.
 *
 * This does NOT guarantee a unique winner, and the parity arithmetic invites
 * the opposite conclusion. A tournament where every pair is decisive can still
 * tie every team on score: A beats B, B beats C, C beats A gives every team one
 * win and one loss. Any regular tournament does this, and they exist for every
 * odd team count from three up. That is why step 3 exists and is guaranteed
 * rather than probable.
 */
export function copeland(
  ballots: Ballot[],
  candidates: TeamId[],
): CopelandResult {
  const pairs: PairwiseEntry[] = [];
  const scores = new Map<TeamId, number>(candidates.map((id) => [id, 0]));

  const positions = ballots.map((ballot) => {
    const index = new Map<TeamId, number>();
    ballot.ranking.forEach((teamId, i) => index.set(teamId, i));
    return index;
  });

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      let aOverB = 0;
      let bOverA = 0;

      for (const index of positions) {
        const pa = index.get(a);
        const pb = index.get(b);
        // A ballot that omits either team expresses no preference between
        // them. Complete ballots are enforced at write time, so this only
        // matters when the pooled set spans competitions.
        if (pa === undefined || pb === undefined) continue;
        if (pa < pb) aOverB += 1;
        else if (pb < pa) bOverA += 1;
      }

      pairs.push({ teamA: a, teamB: b, aOverB, bOverA });
      if (aOverB > bOverA) {
        scores.set(a, scores.get(a)! + 1);
        scores.set(b, scores.get(b)! - 1);
      } else if (bOverA > aOverB) {
        scores.set(b, scores.get(b)! + 1);
        scores.set(a, scores.get(a)! - 1);
      }
    }
  }

  return { pairs, scores };
}

/**
 * The objective block.
 *
 * Linear, with no threshold and no bonus. A cliff ("80% or nothing") would make
 * the last requirement worth more than the first ten, and rewarding overshoot
 * would need a notion of extra credit the grading step does not have.
 *
 * Twelve requirements, eleven met, at the default ceiling is exactly 550.
 */
export function requirementPoints(
  met: number,
  total: number,
  ceiling: number,
): number {
  if (total <= 0) return 0;
  return Math.round(ceiling * (met / total));
}

/**
 * The comparative block.
 *
 * Every points election is weighted equally, so with `k` of them each is worth
 * `ceiling / k`. The rounding happens ONCE, on the block total. Rounding each
 * of three elections separately would cap a perfect team at 399.
 */
export function electionPoints(
  scaledResults: number[],
  k: number,
  ceiling: number,
): number {
  if (k <= 0) return 0;
  const share = ceiling / k;
  return Math.round(scaledResults.reduce((sum, s) => sum + share * s, 0));
}

export interface TalliedElection {
  electionId: string;
  /** Per-team scaled scores from `borda`. */
  results: { teamId: TeamId; scaled: number }[];
}

export interface Grade {
  teamId: TeamId;
  /** Null means officers have not graded this team yet. */
  requirementsMet: number | null;
}

export interface Standing {
  teamId: TeamId;
  requirementsMet: number;
  requirementCount: number;
  requirementPoints: number;
  electionPoints: number;
  totalPoints: number;
  placement: number;
  resolvedBy: "points" | "copeland" | "officer-tiebreak" | null;
}

export interface StandingsInput {
  teams: TeamId[];
  /** Null blocks finalization: officers have not graded yet. */
  requirementCount: number | null;
  grades: Grade[];
  /** Points elections only. */
  elections: TalliedElection[];
  /** Every ballot from every points election, for step 2. */
  pooledBallots: Ballot[];
  /** The officer "who did best" total order. Null when not yet cast. */
  tiebreak: Ballot | null;
}

export type StandingsOutcome =
  | { status: "blocked"; reason: "ungraded" | "missing_tiebreak" }
  | {
      status: "ok";
      standings: Standing[];
      /** One entry per pair the tiebreak actually decided. See below. */
      disclosures: { higherTeamId: TeamId; lowerTeamId: TeamId }[];
    };

/**
 * The full standings chain.
 *
 * Weights renormalize so 1000 stays the ceiling: a team should never face a
 * competition it cannot max out because of how officers configured it.
 *
 *   k = 0                     requirements are worth 1000
 *   requirementCount = 0      elections are worth 1000
 *   both absent               every team scores 0
 *   requirementCount is null  finalization BLOCKS
 *
 * The last row is the important one. Null means officers have not graded yet,
 * which is a data-entry gap rather than a competition without requirements.
 * Defaulting it to zero would publish a wrong winner rather than a visible gap.
 */
export function standings(input: StandingsInput): StandingsOutcome {
  const {
    teams,
    requirementCount,
    grades,
    elections,
    pooledBallots,
    tiebreak,
  } = input;

  if (requirementCount === null) {
    return { status: "blocked", reason: "ungraded" };
  }

  const gradeByTeam = new Map(grades.map((g) => [g.teamId, g.requirementsMet]));
  for (const teamId of teams) {
    if ((gradeByTeam.get(teamId) ?? null) === null) {
      return { status: "blocked", reason: "ungraded" };
    }
  }

  const k = elections.length;
  const hasRequirements = requirementCount > 0;
  const hasElections = k > 0;

  // Renormalization, expressed as two ceilings rather than as a branch per
  // case. Passing the ceiling in is what makes the absent-block rules just
  // calls with a different number instead of a separate code path.
  let requirementCeiling = 0;
  let electionCeiling = 0;
  if (hasRequirements && hasElections) {
    requirementCeiling = REQUIREMENT_CEILING;
    electionCeiling = ELECTION_CEILING;
  } else if (hasRequirements) {
    requirementCeiling = TOTAL_CEILING;
  } else if (hasElections) {
    electionCeiling = TOTAL_CEILING;
  }

  const scaledByTeam = new Map<TeamId, number[]>(teams.map((id) => [id, []]));
  for (const election of elections) {
    for (const result of election.results) {
      scaledByTeam.get(result.teamId)?.push(result.scaled);
    }
  }

  const rows = teams.map((teamId) => {
    const met = gradeByTeam.get(teamId)!;
    const reqPoints = requirementPoints(
      met,
      requirementCount,
      requirementCeiling,
    );
    const elecPoints = electionPoints(
      scaledByTeam.get(teamId) ?? [],
      k,
      electionCeiling,
    );
    return {
      teamId,
      requirementsMet: met,
      requirementCount,
      requirementPoints: reqPoints,
      electionPoints: elecPoints,
      totalPoints: reqPoints + elecPoints,
    };
  });

  const copelandScores = copeland(pooledBallots, teams).scores;
  const tiebreakIndex = new Map<TeamId, number>();
  tiebreak?.ranking.forEach((teamId, i) => tiebreakIndex.set(teamId, i));

  const disclosures: { higherTeamId: TeamId; lowerTeamId: TeamId }[] = [];

  // Group by total points, then resolve each tied group in turn. Only pairs
  // the tiebreak ACTUALLY decides are disclosed, because the officer ranking is
  // never published as an ordering: a tie among three teams discloses the chain
  // among those three and nothing else.
  const byTotal = new Map<number, typeof rows>();
  for (const row of rows) {
    const bucket = byTotal.get(row.totalPoints) ?? [];
    bucket.push(row);
    byTotal.set(row.totalPoints, bucket);
  }

  let blocked = false;
  const resolved: (Standing & { sortKey: number[] })[] = [];

  for (const [total, bucket] of byTotal) {
    if (bucket.length === 1) {
      resolved.push({
        ...bucket[0]!,
        placement: 0,
        resolvedBy: "points",
        sortKey: [-total, 0, 0],
      });
      continue;
    }

    // Step 2: Copeland among the tied teams only.
    const copelandGroups = new Map<number, typeof bucket>();
    for (const row of bucket) {
      const score = copelandScores.get(row.teamId) ?? 0;
      const group = copelandGroups.get(score) ?? [];
      group.push(row);
      copelandGroups.set(score, group);
    }

    for (const [copelandScore, group] of copelandGroups) {
      if (group.length === 1) {
        resolved.push({
          ...group[0]!,
          placement: 0,
          resolvedBy: "copeland",
          sortKey: [-total, -copelandScore, 0],
        });
        continue;
      }

      // Step 3: the officer tiebreak. It is the only step guaranteed to
      // resolve, and the one somebody will forget to cast because it usually
      // is not needed. A tie reaching here without it blocks rather than being
      // decided on a coin flip.
      if (tiebreak === null) {
        blocked = true;
        continue;
      }

      const ordered = [...group].sort(
        (a, b) =>
          (tiebreakIndex.get(a.teamId) ?? Number.MAX_SAFE_INTEGER) -
          (tiebreakIndex.get(b.teamId) ?? Number.MAX_SAFE_INTEGER),
      );

      // A tiebreak that omits one of the tied teams cannot separate them, so
      // it is as good as absent for this group.
      if (ordered.some((r) => !tiebreakIndex.has(r.teamId))) {
        blocked = true;
        continue;
      }

      ordered.forEach((row, i) => {
        resolved.push({
          ...row,
          placement: 0,
          resolvedBy: "officer-tiebreak",
          sortKey: [-total, -copelandScore, i],
        });
        if (i > 0) {
          disclosures.push({
            higherTeamId: ordered[i - 1]!.teamId,
            lowerTeamId: row.teamId,
          });
        }
      });
    }
  }

  if (blocked) return { status: "blocked", reason: "missing_tiebreak" };

  resolved.sort((a, b) => {
    for (let i = 0; i < a.sortKey.length; i++) {
      const diff = a.sortKey[i]! - b.sortKey[i]!;
      if (diff !== 0) return diff;
    }
    return a.teamId.localeCompare(b.teamId);
  });

  const finalStandings = resolved.map(({ sortKey: _sortKey, ...row }, i) => ({
    ...row,
    placement: i + 1,
  }));

  return { status: "ok", standings: finalStandings, disclosures };
}

/** Dense-then-skip placements: two teams at 2 puts the next at 4. */
function assignPlacements<T>(
  rows: T[],
  key: (row: T) => number,
): (T & { placement: number })[] {
  const sorted = [...rows].sort((a, b) => key(b) - key(a));
  const out: (T & { placement: number })[] = [];
  let placement = 0;
  let previous: number | null = null;

  sorted.forEach((row, index) => {
    const value = key(row);
    if (previous === null || value !== previous) {
      placement = index + 1;
      previous = value;
    }
    out.push({ ...row, placement });
  });

  return out;
}
