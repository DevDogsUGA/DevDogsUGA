/**
 * Branch and team names, derived in one place.
 *
 * Pure and separate because three things have to agree on them and run in
 * different places: provisioning creates the branch, the webhook matches an
 * incoming PR's base ref against it, and the nightly reconcile looks the team
 * up by slug. A mismatch is silent. The PR never registers as an entry, which
 * looks to the team like the platform ignoring their work.
 */

/**
 * The judging target for a competition, cut from main and pointed at by team
 * branches.
 *
 *   main
 *    └── comp/2026-fall/w02/study-group-finder   judging target, cut from main
 *         ├── team/2026-fall/w02/study-group-finder/lantern
 *         └── team/2026-fall/w02/study-group-finder/marble
 *
 * The week segment matters. Competitions recur per project across a semester,
 * so a name without it would collide with itself every week.
 * `competitions.slug` carries the week and is unique by construction, which is
 * why the branch is named from the slug rather than from the project.
 *
 * The design sketch abbreviated the project to `sgf` in the team branch.
 * Abbreviating means a second naming rule that nothing derives and everything
 * has to agree on; the full slug costs a longer branch name and nothing else.
 */
export function integrationBranch(competitionSlug: string): string {
  return `comp/${competitionSlug}`;
}

export function teamBranch(competitionSlug: string, teamSlug: string): string {
  return `team/${competitionSlug}/${teamSlug}`;
}

/** Every team branch under one competition, for the ruleset and for cleanup. */
export function teamBranchPattern(competitionSlug: string): string {
  return `team/${competitionSlug}/*`;
}

/**
 * The GitHub team name.
 *
 * GitHub slugifies the name by lowercasing and replacing runs of
 * non-alphanumerics with a single dash. The name is already in that form, so
 * nothing has to ask the API which slug it picked before referencing the team.
 */
export function githubTeamName(
  competitionSlug: string,
  teamSlug: string,
): string {
  return `comp-${slugSegment(competitionSlug)}-${slugSegment(teamSlug)}`;
}

/** What GitHub will slugify the above into. Used to address the team by URL. */
export function githubTeamSlug(
  competitionSlug: string,
  teamSlug: string,
): string {
  return githubTeamName(competitionSlug, teamSlug);
}

function slugSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Whether a PR's base ref is this competition's integration branch.
 *
 * Two details, both silent when wrong:
 *
 *   * **Match on the BASE ref, not the head branch prefix.** A team PR opened
 *     against `main` by mistake, or against last week's integration branch,
 *     has a valid `team/...` head and must not register as an entry. Checking
 *     the head alone accepts both.
 *
 *   * **Exact, not prefix.** `comp/2026-fall/w02/study-group` is a prefix of
 *     `comp/2026-fall/w02/study-group-finder`, and a `startsWith` check would
 *     let one week's PR count for another.
 */
export function isEntryBase(baseRef: string, competitionSlug: string): boolean {
  return normalizeRef(baseRef) === integrationBranch(competitionSlug);
}

/** Whether a PR's head ref is this team's branch. */
export function isTeamHead(
  headRef: string,
  competitionSlug: string,
  teamSlug: string,
): boolean {
  return normalizeRef(headRef) === teamBranch(competitionSlug, teamSlug);
}

/** GitHub sends `refs/heads/x` in some payloads and a bare `x` in others. */
export function normalizeRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}
