import { and, eq, isNotNull, isNull, lte, notExists, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  attendance,
  competitions,
  teamMembers,
  teams,
} from "~/server/db/schema";

/**
 * The judging-start pass. Small, and load-bearing: **no competition star is
 * ever awarded without it.**
 *
 * Every five minutes, for each competition whose `judgingStartsAt` has passed:
 *
 *   1. Freeze participation — turn each team's live entry into a permanent
 *      fact.
 *   2. Create solo teams for members of that workshop who never joined one, so
 *      attribution has a row to hang on.
 *
 * Nothing else. The roster hard-lock needs no write at all — it falls out of
 * `judgingStartsAt` in the lock predicate.
 *
 * Deliberately NOT folded into the election tally cron, even though both run
 * every five minutes: the tally blocks on ungraded competitions and on a
 * missing tiebreak ballot, and freezing participation has to happen whether or
 * not grading is done, or a slow officer costs every team its star.
 */
export interface JudgingPassReport {
  frozen: number;
  soloTeamsCreated: number;
}

const SOLO_JOIN_CODE = "SOLO";

export async function runJudgingPass(): Promise<JudgingPassReport> {
  const frozen = await freezeParticipation();
  const soloTeamsCreated = await createSoloTeams();
  return { frozen, soloTeamsCreated };
}

/**
 * Turns "has a live entry" into "competed", once.
 *
 * Idempotent by the `competedAt is null` guard, which is what makes a
 * five-minute cadence safe. The window matters: a PR closed between judging
 * starting and this pass running costs that team its star. Five minutes is
 * tight enough that losing one would take deliberate effort, and the officer
 * override exists for the case where somebody manages it.
 */
async function freezeParticipation(): Promise<number> {
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

/**
 * Gives every attendee of a judged workshop a team, so attribution has a row.
 *
 * A member who attended the workshop but never joined a team still earned a
 * workshop star, and the star view reaches attendance directly — so this is
 * not what makes that work. It exists so the standings and award surfaces,
 * which are keyed by team, have somewhere to put a solo participant rather
 * than dropping them.
 *
 * Skips anybody who already holds a team for the competition, which is what
 * makes re-running it a no-op.
 */
async function createSoloTeams(): Promise<number> {
  const candidates = await db
    .select({
      userId: attendance.userId,
      competitionId: competitions.id,
    })
    .from(attendance)
    .innerJoin(competitions, eq(competitions.workshopId, attendance.workshopId))
    .where(
      and(
        isNotNull(attendance.workshopId),
        isNotNull(competitions.judgingStartsAt),
        lte(competitions.judgingStartsAt, sql`now()`),
        // Correlated NOT EXISTS rather than a tuple NOT IN. The obvious
        // spelling — `(userId, competitionId) not in (select ...)` — is what
        // Postgres rejects with "subquery has too few columns", because
        // Drizzle renders the projection as a single expression rather than
        // as a row constructor.
        notExists(
          db
            .select({ one: sql`1` })
            .from(teamMembers)
            .where(
              and(
                eq(teamMembers.userId, attendance.userId),
                eq(teamMembers.competitionId, competitions.id),
              ),
            ),
        ),
      ),
    );

  let created = 0;

  for (const candidate of candidates) {
    // One transaction per solo team rather than one for all of them: a single
    // member who cannot be placed — because they joined a team in the seconds
    // since the query above — should not roll back everybody else's.
    await db
      .transaction(async (tx) => {
        const [team] = await tx
          .insert(teams)
          .values({
            competitionId: candidate.competitionId,
            slug: `solo-${candidate.userId.slice(0, 8)}`,
            name: "Solo entry",
            joinCode: SOLO_JOIN_CODE,
            createdBy: candidate.userId,
          })
          .returning({ id: teams.id });

        if (!team) return;

        await tx.insert(teamMembers).values({
          teamId: team.id,
          competitionId: candidate.competitionId,
          userId: candidate.userId,
          role: "lead",
        });

        created += 1;
      })
      .catch((error: unknown) => {
        // The unique constraint on ("userId", "competitionId") is the real
        // enforcement here; losing that race means somebody joined a team
        // between the select and the insert, which is exactly the outcome
        // this pass wanted anyway.
        const code = (error as { code?: string } | null)?.code;
        if (code !== "23505") throw error;
      });
  }

  return created;
}
