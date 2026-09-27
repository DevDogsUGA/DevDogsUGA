/**
 * The two membership caps, and the pure predicates that read them.
 *
 * Both are global constants, not per-competition overrides: a team is not
 * scoped to a competition, so "this competition's cap" is not a question
 * that has an answer. A per-competition `maxTeamSize` column would be a
 * configuration point with no way to configure it -- nothing would ever set
 * it and no surface would exist to change it -- which is just a constant
 * kept somewhere harder to read than code. The cap lives here instead.
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
