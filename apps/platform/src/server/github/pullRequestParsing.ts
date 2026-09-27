import { normalizeRef, teamSlugFromBranch } from "./naming";

/**
 * The pure half of the competition-entries mirror: recognizing an entry from
 * a pull request's own fields, with no database and no network.
 *
 * Extracted from `server/github/pullRequest.ts` for the same reason
 * `competitionParsing.ts` is split from `competitions.ts`: nothing here
 * imports `~/env`, so `pullRequestParsing.test.ts` can exercise it as a plain unit
 * test against string fixtures, without `~/env`'s runtime validation
 * demanding a configured Supabase URL and key the way importing
 * `pullRequest.ts` itself would. See that file's header for the ingestion
 * story this logic backs -- resolving a slug and issue numbers to real
 * rows, the upsert, the webhook and nightly-reconcile triggers -- none of
 * which lives here.
 */

/**
 * The team slug a PR's head branch names, when that PR also targets `main`
 * -- or null when either half of that is not true.
 *
 * Deliberately not `naming.ts`'s `isTeamHead`: that function tests a head
 * ref against ONE already-known team slug, which fits a caller that already
 * has a candidate team in hand. This module never does -- a `pull_request`
 * payload names a branch, not a team row -- so it derives the slug from the
 * ref directly (`teamSlugFromBranch`, the same function the `create`/`delete`
 * branch webhooks use) and leaves the "is this actually a mirrored team"
 * question to the caller's own database lookup.
 */
export function teamSlugForHead(
  headRef: string,
  baseRef: string,
): string | null {
  if (normalizeRef(baseRef) !== "main") return null;
  return teamSlugFromBranch(headRef);
}

const ISSUE_URL_RE =
  /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/g;
const CROSS_REPO_RE = /\b([\w.-]+\/[\w.-]+)#(\d+)\b/g;
const BARE_RE = /(?<![\w/])#(\d+)\b/g;

/**
 * Every issue number a PR's title/body links IN `competitionRepo`, in the
 * order they first appear, deduplicated.
 *
 * Three shapes, matched in order of specificity so nothing is double
 * counted: a full issue URL, GitHub's cross-repo `owner/repo#123` shorthand,
 * and a bare `#123` (assumed to mean `competitionRepo`, the same repo a PR
 * opened against it necessarily lives in). Each pass replaces what it
 * matched with a space before the next runs, so a cross-repo reference's own
 * `#123` never also counts as a second, bare reference to the wrong number.
 * `BARE_RE`'s negative lookbehind is a second line of defence for the same
 * thing, in case a URL or cross-repo match is ever malformed enough to slip
 * through unmatched.
 */
export function referencedIssueNumbers(
  text: string,
  competitionRepo: string,
): number[] {
  const numbers: number[] = [];
  let remaining = text;

  remaining = remaining.replace(
    ISSUE_URL_RE,
    (_match, repo: string, num: string) => {
      if (repo === competitionRepo) numbers.push(Number(num));
      return " ";
    },
  );

  remaining = remaining.replace(
    CROSS_REPO_RE,
    (_match, repo: string, num: string) => {
      if (repo === competitionRepo) numbers.push(Number(num));
      return " ";
    },
  );

  remaining.replace(BARE_RE, (_match, num: string) => {
    numbers.push(Number(num));
    return " ";
  });

  return [...new Set(numbers)];
}
