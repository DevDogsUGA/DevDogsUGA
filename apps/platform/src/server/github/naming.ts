/**
 * Branch and team names, derived in one place.
 *
 * Pure and separate because more than one thing has to agree on them and run
 * in different places: provisioning creates the branch, a future webhook
 * matches an incoming PR's head against it, and the nightly reconcile looks
 * the team up by slug. A mismatch is silent -- the wrong things quietly stop
 * talking to each other.
 */

/**
 * A team's branch, the whole of what "team" means on GitHub.
 *
 *   main
 *    ├── team/study-group-finder
 *    └── team/marble-run
 *
 * Off `main`, not off a per-competition integration branch: the platform
 * redesign's teams-core step made teams persistent, competition-independent
 * projects, so there is no longer a week-scoped branch to cut from. A team
 * exists once, for as long as it exists, and its branch does too.
 */
export function teamBranch(teamSlug: string): string {
  return `team/${teamSlug}`;
}

/**
 * The GitHub team name.
 *
 * GitHub slugifies the name by lowercasing and replacing runs of
 * non-alphanumerics with a single dash. The name is already in that form, so
 * nothing has to ask the API which slug it picked before referencing the team.
 */
export function githubTeamName(teamSlug: string): string {
  return `team-${slugSegment(teamSlug)}`;
}

/** What GitHub will slugify the above into. Used to address the team by URL. */
export function githubTeamSlug(teamSlug: string): string {
  return githubTeamName(teamSlug);
}

function slugSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Whether a PR's head ref is this team's branch. */
export function isTeamHead(headRef: string, teamSlug: string): boolean {
  return normalizeRef(headRef) === teamBranch(teamSlug);
}

/** GitHub sends `refs/heads/x` in some payloads and a bare `x` in others. */
export function normalizeRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}
