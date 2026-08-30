/**
 * The pure half of the PR handler: what a webhook payload means.
 *
 * Separated from the database write so it can be tested without one. Both
 * decisions here are silent when wrong, which is why each has a test. A
 * mis-parsed branch means the PR never registers as an entry, and a mis-mapped
 * close costs a team its star.
 */

export type SubmissionState = "open" | "closed" | "merged";

export interface PullRequestEvent {
  action: string;
  number: number;
  htmlUrl: string;
  baseRef: string;
  headRef: string;
  merged: boolean;
}

export type PullRequestOutcome =
  | { applied: true; teamId: string; state: SubmissionState }
  | { applied: false; reason: PullRequestSkip };

export type PullRequestSkip =
  | "not_a_team_branch"
  | "wrong_base"
  | "unknown_team"
  | "ignored_action"
  | "competed";

/**
 * Which state a PR event means.
 *
 * **Merged is not closed.** `pull_request.closed` fires for both, but a merged
 * entry won the merge and a closed one withdrew, so this reads the `merged`
 * flag rather than treating every close alike. Getting that wrong costs a team
 * its star silently, because `closed` unlocks the roster and `merged` does not.
 */
export function stateFor(event: PullRequestEvent): SubmissionState | null {
  switch (event.action) {
    case "opened":
    case "reopened":
    case "ready_for_review":
      return "open";
    case "closed":
      return event.merged ? "merged" : "closed";
    default:
      // edited, synchronize, labeled, review_requested… none of which change
      // whether the PR exists as an entry.
      return null;
  }
}

/**
 * Reads a team branch back into the pair that names it.
 *
 * `team/<competitionSlug>/<teamSlug>`, where the competition slug itself
 * contains slashes (`2026-fall/w02/study-group-finder`), so the split is
 * "first segment after the prefix through the last slash" rather than a fixed
 * number of parts. `slugify` in the team actions generates the team slug, so it
 * can never contain a slash, which is what makes the last segment unambiguous.
 */
export function parseTeamBranch(
  ref: string,
): { competitionSlug: string; teamSlug: string } | null {
  const branch = ref.replace(/^refs\/heads\//, "");
  if (!branch.startsWith("team/")) return null;

  const rest = branch.slice("team/".length);
  const lastSlash = rest.lastIndexOf("/");
  if (lastSlash <= 0) return null;

  const competitionSlug = rest.slice(0, lastSlash);
  const teamSlug = rest.slice(lastSlash + 1);
  if (!competitionSlug || !teamSlug) return null;

  return { competitionSlug, teamSlug };
}
