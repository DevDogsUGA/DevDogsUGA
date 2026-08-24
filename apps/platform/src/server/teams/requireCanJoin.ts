import { and, count, eq, sql } from "drizzle-orm";
import type { db } from "~/server/db";
import { competitions, teamMembers, teams } from "~/server/db/schema";
import { identitiesInAuth } from "~/supabase/drizzle/schema";
import { TeamActionError, isUniqueViolation } from "./errors";
import { DEFAULT_MAX_TEAM_SIZE } from "./limits";
import { isLocked } from "./lockState";

/** The transaction handle Drizzle hands to `db.transaction`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The join path a member takes, called from `joinTeam` and
 * `respondToMembership`.
 *
 * Both run the same checks in the same order. Drift between copies is how
 * somebody ends up on two teams, so there is one copy and the two callers
 * share it.
 *
 * `reformTeam` is the exception, and deliberately: it re-creates a team for
 * the next competition with its lead already inside, so it calls `requireLead`
 * and `requireOpenCompetition` and then `insertMembership` directly. The lead
 * it inserts is therefore not checked here — the unique constraint is what
 * stops that row being a second team, rather than check 4. Everyone else on
 * the previous roster is INVITED rather than inserted, and their answers come
 * back through `respondToMembership`, which does run these checks.
 *
 * It takes the TRANSACTION HANDLE, not the db. A relationship check answered
 * outside the transaction that acts on the answer is a TOCTOU window: the
 * roster can lock, or fill, between the check and the insert.
 *
 * The design note spells this `requireCanJoin(tx, competitionId, userId)`, but
 * two of the checks — the lock and the cap — are questions about a TEAM, not a
 * competition. Taking the team and deriving the competition from it also makes
 * a mismatched (team, competition) pair unrepresentable at the call site.
 */
export async function requireCanJoin(
  tx: Tx,
  { teamId, userId }: { teamId: string; userId: string },
): Promise<{ competitionId: string }> {
  // Serializes every concurrent join FOR THIS TEAM, and only this team. See
  // the cap check below for why a lock rather than a constraint.
  await tx.execute(
    sql`select 1 from "platform"."teams" where "id" = ${teamId} for update`,
  );

  const [row] = await tx
    .select({
      competitionId: teams.competitionId,
      submissionState: teams.submissionState,
      lockedManuallyAt: teams.lockedManuallyAt,
      judgingStartsAt: competitions.judgingStartsAt,
      maxTeamSize: competitions.maxTeamSize,
    })
    .from(teams)
    .innerJoin(competitions, eq(competitions.id, teams.competitionId))
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!row) throw new TeamActionError("not_found");

  // 1. The competition is still open.
  //
  // Judging beginning is what closes it, which is the same clock the lock
  // predicate reads — but the two are worth keeping separate, because a
  // closed competition and a locked roster need different sentences.
  const judgingAt = row.judgingStartsAt;
  if (judgingAt !== null && new Date(judgingAt).getTime() <= Date.now()) {
    throw new TeamActionError("competition_closed");
  }

  // 2. The roster is open.
  if (isLocked(row)) throw new TeamActionError("roster_locked");

  // 3. A linked GitHub identity, because joining provisions repository access
  //    and there is nothing to grant it to otherwise.
  const [github] = await tx
    .select({ id: identitiesInAuth.id })
    .from(identitiesInAuth)
    .where(
      and(
        eq(identitiesInAuth.userId, userId),
        eq(identitiesInAuth.provider, "github"),
      ),
    )
    .limit(1);

  if (!github) throw new TeamActionError("github_not_linked");

  // 4. Room on the team.
  //
  // This check does not ENFORCE the cap — it produces a good error message.
  // "At most four rows" is a count, not a uniqueness property, so no index
  // expresses it and two concurrent joins would interleave between the select
  // and the insert. The `for update` above is what actually enforces it: the
  // second transaction blocks until the first commits, then reads the true
  // count and fails here cleanly.
  const cap = row.maxTeamSize ?? DEFAULT_MAX_TEAM_SIZE;
  const [tally] = await tx
    .select({ n: count() })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));

  if ((tally?.n ?? 0) >= cap) throw new TeamActionError("team_full");

  // 5. Not already on a team for this competition.
  //
  // Also advisory. The row lock above does not help here at all: two
  // transactions accepting invitations from DIFFERENT teams lock different
  // rows and never contend. What saves it is the unique constraint, caught by
  // the insert helper below — this check exists so the common case gets the
  // right message without waiting for a constraint to fire.
  const [existing] = await tx
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.competitionId, row.competitionId),
      ),
    )
    .limit(1);

  if (existing) throw new TeamActionError("already_on_team");

  return { competitionId: row.competitionId };
}

/**
 * Inserts the membership, translating the constraint that actually enforces
 * "one team per member per competition".
 *
 * Two races, two mechanisms: a counting race is caught by nothing and needs a
 * lock; a uniqueness race is caught by a constraint and needs translating.
 * Telling them apart is the whole skill here, and getting it wrong stays
 * invisible until a real event with real simultaneity.
 */
export async function insertMembership(
  tx: Tx,
  {
    teamId,
    competitionId,
    userId,
    role = "member",
  }: {
    teamId: string;
    competitionId: string;
    userId: string;
    role?: "lead" | "member";
  },
): Promise<void> {
  try {
    await tx
      .insert(teamMembers)
      .values({ teamId, competitionId, userId, role });
  } catch (error) {
    if (isUniqueViolation(error, "teamMembers_userId_competitionId_key")) {
      throw new TeamActionError("already_on_team");
    }
    if (isUniqueViolation(error, "teamMembers_one_lead_per_team")) {
      throw new TeamActionError("not_the_lead", "That team already has a lead");
    }
    throw error;
  }
}
