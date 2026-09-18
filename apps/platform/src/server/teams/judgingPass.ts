import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { competitions, teams } from "~/server/db/schema";

/**
 * The judging-start pass. Small, and load-bearing: **no competition star is
 * ever awarded without it.**
 *
 * Every five minutes, for each competition whose `judgingStartsAt` has passed:
 *
 * Freeze participation, turning each registered team's live entry into a
 * permanent fact. Meeting attendance never manufactures a competition team:
 * participation requires both registration and a submitted entry.
 *
 * Nothing else. The roster hard-lock needs no write; it falls out of
 * `judgingStartsAt` in the lock predicate.
 *
 * Deliberately NOT folded into the election tally cron, though both run every
 * five minutes: the tally blocks on ungraded competitions and on a missing
 * tiebreak ballot, and freezing has to happen whether or not grading is done,
 * or a slow officer costs every team its star.
 */
export interface JudgingPassReport {
  frozen: number;
}

export async function runJudgingPass(): Promise<JudgingPassReport> {
  const frozen = await freezeParticipation();
  return { frozen };
}

/**
 * Turns "has a live entry" into "competed", once.
 *
 * Idempotent by the `competedAt is null` guard, which makes a five-minute
 * cadence safe. The window matters: a PR closed between judging starting and
 * this pass running costs that team its star. Five minutes is tight enough
 * that losing one takes deliberate effort, and the officer override covers
 * whoever manages it.
 */
async function freezeParticipation(): Promise<number> {
  // False positive. The `.where()` is right there with five conditions; the
  // rule stops tracking the chain at the intervening `.from(competitions)` and
  // concludes this is an unfiltered UPDATE. Verified by reading, not by
  // assuming -- an `update` with no `where` writes every row, so this
  // suppression is only safe because the filter below is real.
  // eslint-disable-next-line drizzle/enforce-update-with-where
  const rows = await db
    .update(teams)
    .set({ competedAt: sql`now()` })
    .from(competitions)
    .where(
      and(
        eq(competitions.id, teams.competitionId),
        eq(teams.submissionState, "open"),
        isNull(teams.competedAt),
        isNotNull(competitions.judgingStartsAt),
        lte(competitions.judgingStartsAt, sql`now()`),
      ),
    )
    .returning({ id: teams.id });

  return rows.length;
}
