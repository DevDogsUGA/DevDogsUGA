"use server";

import { eq } from "drizzle-orm";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { teamAwards, teams } from "~/server/db/schema";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { TeamActionError, isUniqueViolation } from "~/server/teams/errors";

async function requireOfficer(): Promise<string> {
  const callerId = await expectSession();
  if (!(await canUserManageAttendance(callerId))) {
    throw new Error("Not authorized");
  }
  return callerId;
}

/**
 * Records a competition's winner (or another award category).
 *
 * `competitionId` is a caller-supplied argument rather than something read
 * off the team, because the platform redesign's teams-core step made teams
 * competition-independent -- a team no longer names the one competition it
 * belongs to, so which competition this award is FOR is exactly the thing
 * this call is recording, not something derivable from `teamId` alone.
 */
export async function awardTeam(
  teamId: string,
  competitionId: string,
  category: string,
  citation?: string,
): Promise<string> {
  const callerId = await requireOfficer();

  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) throw new TeamActionError("not_found");

  try {
    const [row] = await db
      .insert(teamAwards)
      .values({
        teamId,
        competitionId,
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
