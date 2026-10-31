import type { CommitItem } from "~/server/loaders/commits";

/**
 * Pure shaping for the contribution list, kept out of the component so the
 * "only github.com becomes an href" rule can be tested.
 */

export interface ContributionRow {
  key: string;
  repo: string;
  /** The abbreviated commit id, `abc1234`. */
  short: string;
  label: string;
  /** Null when the stored URL is not a github.com link; render plain text. */
  href: string | null;
  committedAt: Date;
}

/** How many characters of the commit id are shown. */
const SHORT_SHA = 7;

const GITHUB_PREFIX = "https://github.com/";

/**
 * Rows in the order given (the loader sorts newest first). The URL is built
 * from cached repository names, so it is re-checked here, where it becomes an
 * `href` on a public page.
 */
export function contributionRows(
  items: readonly CommitItem[],
): ContributionRow[] {
  return items.map((item) => ({
    key: item.sha,
    repo: item.repo,
    short: item.sha.slice(0, SHORT_SHA),
    label: item.title.trim() || `Commit ${item.sha.slice(0, SHORT_SHA)}`,
    href: item.url.startsWith(GITHUB_PREFIX) ? item.url : null,
    committedAt: item.committedAt,
  }));
}
