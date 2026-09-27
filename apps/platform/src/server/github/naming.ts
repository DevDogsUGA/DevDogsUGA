/**
 * Branch and team names, derived in one place.
 *
 * Pure and separate because more than one thing has to agree on them and run
 * in different places: provisioning creates the branch, the webhook route
 * (`server/github/webhookEvents.ts`) matches an incoming event's team or
 * branch name back to a slug, and the nightly reconcile looks the team up by
 * slug. A mismatch is silent -- the wrong things quietly stop talking to each
 * other.
 */

/**
 * A team's branch, the whole of what "team" means on GitHub.
 *
 *   main
 *    ├── team/study-group-finder
 *    └── team/marble-run
 *
 * Off `main`, not off a per-competition integration branch: a team is a
 * persistent, competition-independent project, so there is no week-scoped
 * branch to cut from. A team exists once, for as long as it exists, and its
 * branch does too.
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

/** GitHub sends `refs/heads/x` in some payloads and a bare `x` in others. */
export function normalizeRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

/**
 * The platform slug a `team/<slug>` branch ref names, or null if this ref is
 * not a team branch at all.
 *
 * The exact inverse of `teamBranch`, for the `create`/`delete` ref webhook
 * events: both send a bare ref (`"team/sicem"`), never `refs/heads/...`, but
 * `normalizeRef` is run first anyway rather than assumed, because nothing
 * about a webhook payload's shape is a contract this file controls.
 */
export function teamSlugFromBranch(ref: string): string | null {
  const normalized = normalizeRef(ref);
  return normalized.startsWith("team/")
    ? normalized.slice("team/".length)
    : null;
}

/**
 * The platform slug a GitHub team slug (`"team-<slug>"`) names, or null if it
 * is not one of ours.
 *
 * The exact inverse of `githubTeamSlug`, for the `membership`/`team` webhook
 * events, both of which carry the GitHub team's own slug rather than the
 * platform slug that produced it. Unambiguous because `githubTeamSlug` only
 * ever prepends the fixed literal `"team-"` -- stripping it back off, once,
 * is not lossy the way re-deriving through `slugSegment` in the other
 * direction would be.
 */
export function platformSlugFromGithubTeamSlug(
  githubSlug: string,
): string | null {
  return githubSlug.startsWith("team-")
    ? githubSlug.slice("team-".length)
    : null;
}
