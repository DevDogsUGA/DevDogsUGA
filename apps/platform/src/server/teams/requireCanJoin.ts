import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { db } from "~/server/db";
import { teamMembers, teams } from "~/server/db/schema";
import { identitiesInAuth } from "~/supabase/drizzle/schema";
import { TeamActionError, isUniqueViolation } from "./errors";
import { hasRoomOnTeam, underConcurrentTeamCap } from "./limits";

/** The transaction handle Drizzle hands to `db.transaction`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Transaction-scoped advisory locks, namespaced by what they key on.
 *
 * `hashtext` folds a uuid into the 32-bit key `pg_advisory_xact_lock`'s
 * two-argument form takes; the first argument is the namespace tag, so a user
 * id and a team id can never hash into the same lock by coincidence.
 * Transaction-scoped, so each releases itself on commit or rollback rather
 * than needing an explicit unlock on every exit path, including the ones that
 * throw.
 *
 * Every caller that can race on the same team or the same user's cap takes
 * these in the SAME fixed order -- user, then team -- so two concurrent joins,
 * even onto the same team, can never each hold the lock the other one is
 * waiting for.
 */
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(1, hashtext(${userId}))`);
}

export async function lockTeam(tx: Tx, teamId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(2, hashtext(${teamId}))`);
}

/**
 * The join path a member takes, called from `joinTeam` and every acceptance in
 * `respondToMembership`.
 *
 * Every caller runs the same checks in the same order, under the same lock.
 * Drift between copies is how somebody ends up over a cap, so there is one
 * copy and every caller shares it.
 *
 * It takes the TRANSACTION HANDLE, not the db, and it is the one place that
 * takes the advisory locks. A check answered outside the transaction that then
 * acts on the answer is a TOCTOU window: a cap can be exceeded, or a team can
 * fill, between the check and the write. The caller is expected to make the
 * GitHub grant and the mirror insert inside the SAME transaction, after this
 * returns, so the lock covers the whole join rather than just the count.
 */
export async function requireCanJoin(
  tx: Tx,
  { teamId, userId }: { teamId: string; userId: string },
): Promise<{ slug: string }> {
  await lockUser(tx, userId);
  await lockTeam(tx, teamId);

  const [row] = await tx
    .select({ slug: teams.slug })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!row) throw new TeamActionError("not_found");

  // 1. A linked GitHub identity, because joining provisions repository access
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

  // 2. Not already active on this exact team.
  const [existing] = await tx
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.leftAt),
      ),
    )
    .limit(1);

  if (existing) throw new TeamActionError("already_on_team");

  // 3. Under the concurrent-team cap.
  //
  // This check does not ENFORCE the cap; it produces a good error message.
  // "At most two active rows" is a count, not a uniqueness property, so no
  // index expresses it and two concurrent joins would interleave between the
  // select and the insert. The advisory lock above is what enforces it: the
  // second transaction blocks until the first commits, then reads the true
  // count and fails here cleanly.
  const [activeTeams] = await tx
    .select({ n: count() })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt)));

  if (!underConcurrentTeamCap(activeTeams?.n ?? 0)) {
    throw new TeamActionError("too_many_teams");
  }

  // 4. Room on the team. Advisory too, for the same reason as the cap above.
  const [teamSize] = await tx
    .select({ n: count() })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftAt)));

  if (!hasRoomOnTeam(teamSize?.n ?? 0)) {
    throw new TeamActionError("team_full");
  }

  return { slug: row.slug };
}

/**
 * Inserts the membership, translating the constraint that actually enforces
 * "at most one active membership per (team, member)".
 *
 * Two races, two mechanisms: a counting race is caught by nothing and needs a
 * lock; a uniqueness race is caught by a constraint and needs translating.
 * Confusing the two stays invisible until a real event with real simultaneity.
 */
export async function insertMembership(
  tx: Tx,
  {
    teamId,
    userId,
    role = "member",
  }: {
    teamId: string;
    userId: string;
    role?: "lead" | "member";
  },
): Promise<void> {
  try {
    await tx.insert(teamMembers).values({ teamId, userId, role });
  } catch (error) {
    if (isUniqueViolation(error, "teamMembers_one_active_per_team_user")) {
      throw new TeamActionError("already_on_team");
    }
    if (isUniqueViolation(error, "teamMembers_one_lead_per_team")) {
      throw new TeamActionError("not_the_lead", "That team already has a lead");
    }
    throw error;
  }
}
