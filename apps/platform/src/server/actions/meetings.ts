"use server";

import { eq, sql } from "drizzle-orm";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { teamAwards, teams } from "~/server/db/schema";
import { canUserEditAttendance } from "~/server/actions/permissions";
import { TeamActionError, isUniqueViolation } from "~/server/teams/errors";

async function requireOfficer(): Promise<string> {
  const callerId = await expectSession();
  if (!(await canUserEditAttendance(callerId))) {
    throw new Error("Not authorized");
  }
  return callerId;
}

/**
 * Officer override for a team that presented without a PR.
 *
 * The webhook path writes `submissionState` directly from GitHub events and
 * contains no time logic at all, which is what keeps it simple enough to be
 * obviously right. This is the manual counterpart, and it writes the same
 * three columns together because they are constrained to be all-or-nothing.
 */
export async function setSubmission(
  teamId: string,
  prUrl: string | null,
): Promise<void> {
  await requireOfficer();

  await db
    .update(teams)
    .set(
      prUrl === null
        ? { submissionUrl: null, submittedAt: null, submissionState: null }
        : {
            submissionUrl: prUrl,
            submittedAt: sql`coalesce(${teams.submittedAt}, now())`,
            submissionState: "open",
          },
    )
    .where(eq(teams.id, teamId));
}

/**
 * Officer lock, and its release.
 *
 * Distinct from the entry and judging terms of the lock predicate: those are
 * facts about the world, this is somebody deciding. Clearing it cannot unlock
 * a roster that either of the other two terms still holds shut, which is why
 * the predicate is an OR rather than a stored flag.
 */
export async function setManualLock(
  teamId: string,
  locked: boolean,
): Promise<void> {
  await requireOfficer();

  await db
    .update(teams)
    .set({ lockedManuallyAt: locked ? new Date() : null })
    .where(eq(teams.id, teamId));
}

export async function awardTeam(
  teamId: string,
  category: string,
  citation?: string,
): Promise<string> {
  const callerId = await requireOfficer();

  const [team] = await db
    .select({ competitionId: teams.competitionId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) throw new TeamActionError("not_found");

  try {
    const [row] = await db
      .insert(teamAwards)
      .values({
        teamId,
        competitionId: team.competitionId,
        category,
        citation,
        awardedBy: callerId,
      })
      .returning({ id: teamAwards.id });

    if (!row) throw new TeamActionError("not_found");
    return row.id;
  } catch (error) {
    // At most one winner per competition. Every other category may repeat, so
    // this is the only award conflict worth a specific message.
    if (isUniqueViolation(error, "teamAwards_one_winner_per_competition")) {
      throw new TeamActionError(
        "request_not_actionable",
        "That competition already has a winner",
      );
    }
    throw error;
  }
}
