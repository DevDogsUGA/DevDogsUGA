"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { ballotRankings, ballots, elections } from "~/server/db/schema";
import { validateBallot } from "~/server/elections/ballotOrder";
import { sqlState } from "~/server/teams/errors";
import { getBallotOptions, getEligibility } from "~/server/loaders/elections";

/**
 * Casting a ballot.
 *
 * Every check the loader makes for display is made again here. That is not
 * duplication to factor away: the loader decides what to SHOW and this decides
 * what to ACCEPT, and a caller who skips the page has to hit the same wall.
 * Sharing `getEligibility` keeps the two answers identical, not merely
 * similar.
 */

export type CastBallotResult =
  { ok: true } | { ok: false; error: CastBallotError };

export type CastBallotError =
  | "not_open"
  | "not_eligible"
  | "already_voted"
  | "no_team"
  | "not_the_lead"
  | "incomplete"
  | "duplicate"
  | "unknown_team"
  | "untouched";

/**
 * @param ranking Team ids, best first. Must be complete, see `validateBallot`.
 * @param touched Whether the voter reordered or explicitly confirmed the
 *   presented order. A ballot cast by pressing submit on an untouched form is
 *   rejected here as well as in the form, because the form is the half that
 *   can be skipped.
 */
export async function castBallot(
  electionId: string,
  ranking: string[],
  touched: boolean,
): Promise<CastBallotResult> {
  const userId = await expectSession();

  const eligibility = await getEligibility(electionId, userId);
  if (!eligibility.canVote) {
    return { ok: false, error: eligibility.reason ?? "not_eligible" };
  }

  const options = await getBallotOptions(await competitionOf(electionId));
  const problem = validateBallot(
    ranking,
    options.map((o) => o.teamId),
    touched,
  );
  if (problem) return { ok: false, error: problem };

  const electorate = await electorateOf(electionId);

  try {
    await db.transaction(async (tx) => {
      const [ballot] = await tx
        .insert(ballots)
        .values({
          electionId,
          // Denormalized so the composite foreign key can enforce that a team
          // ballot names a team and an officer ballot does not. No application
          // check can be trusted with that invariant, because it has to hold
          // for rows written by anything.
          electorate,
          teamId: eligibility.teamId,
          castBy: userId,
        })
        .returning({ id: ballots.id });

      if (!ballot) throw new Error("Ballot insert returned no row");

      await tx.insert(ballotRankings).values(
        ranking.map((candidateTeamId, index) => ({
          ballotId: ballot.id,
          // 1-based: rank 1 is first place, which is what the tally's
          // `n − r` scoring assumes and what a voter would say out loud.
          rank: index + 1,
          candidateTeamId,
        })),
      );
    });
  } catch (error) {
    // The uniqueness race. Two tabs, or a double submit: the second insert
    // loses to the partial unique index rather than to a check that read
    // before the first one committed.
    if (isDuplicateBallot(error)) return { ok: false, error: "already_voted" };
    throw error;
  }

  revalidatePath("/vote");
  return { ok: true };
}

async function competitionOf(electionId: string): Promise<string> {
  const [row] = await db
    .select({ competitionId: elections.competitionId })
    .from(elections)
    .where(eq(elections.id, electionId));
  if (!row) throw new Error(`No election ${electionId}`);
  return row.competitionId;
}

async function electorateOf(electionId: string): Promise<"teams" | "officers"> {
  const [row] = await db
    .select({ electorate: elections.electorate })
    .from(elections)
    .where(eq(elections.id, electionId));
  if (!row) throw new Error(`No election ${electionId}`);
  return row.electorate;
}

/**
 * Either unique index can fire here, one ballot per team per election or one
 * officer ballot per election, so this matches on the SQLSTATE rather than on a
 * constraint name. Both mean the same sentence to the voter.
 *
 * `sqlState` unwraps Drizzle's `DrizzleQueryError`; reading `.code` off the
 * thrown error directly is always `undefined`. See `teams/errors.ts`.
 */
function isDuplicateBallot(error: unknown): boolean {
  return sqlState(error) === "23505";
}
