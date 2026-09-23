/**
 * The two membership caps, and the pure predicates that read them.
 *
 * Both are global constants now, not per-competition overrides: a team is no
 * longer scoped to a competition, so "this competition's cap" is not a
 * question that has an answer any more. There used to be a per-competition
 * `maxTeamSize` column for the one case that seemed to need a different cap,
 * but nothing ever set it and no surface existed to change it -- a
 * configuration point with no way to configure it is a constant kept
 * somewhere harder to read, so the platform redesign's teams-core step
 * dropped the column along with the concept.
 *
 * `requireCanJoin` is the only enforcement; these are read there. Extracted
 * here, and as pure functions rather than inline comparisons, so the boundary
 * condition (exactly at the cap) has one definition and one test, rather than
 * being reimplemented at every call site with a `>=` that could as easily have
 * been a `>`.
 */

/** At most this many ACTIVE members on one team. */
export const MAX_TEAM_SIZE = 4;

/** At most this many teams one contributor is ACTIVELY on, concurrently. */
export const MAX_CONCURRENT_TEAMS_PER_USER = 2;

/** Whether a team with this many active members has room for one more. */
export function hasRoomOnTeam(activeMemberCount: number): boolean {
  return activeMemberCount < MAX_TEAM_SIZE;
}

/**
 * Whether a member already on this many active teams may join one more.
 */
export function underConcurrentTeamCap(activeTeamCount: number): boolean {
  return activeTeamCount < MAX_CONCURRENT_TEAMS_PER_USER;
}
