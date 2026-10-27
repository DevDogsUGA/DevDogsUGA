import type { ContributionItem } from "~/server/loaders/contributions";

/**
 * Pure shaping for the contribution list, kept out of the component so the
 * "only github.com becomes an href" rule can be tested.
 */

export interface ContributionRow {
  key: string;
  repo: string;
  number: number;
  label: string;
  /** Null when the stored URL is not a github.com link; render plain text. */
  href: string | null;
  mergedAt: Date;
}

const GITHUB_PREFIX = "https://github.com/";

/**
 * Rows in the order given (the loader sorts newest first). The URL comes from
 * a webhook payload, so it is re-checked here, where it becomes an `href` on a
 * public page.
 */
export function contributionRows(
  items: readonly ContributionItem[],
): ContributionRow[] {
  return items.map((item) => ({
    key: `${item.repo}#${item.number}`,
    repo: item.repo,
    number: item.number,
    label: item.title.trim() || `Pull request #${item.number}`,
    href: item.url.startsWith(GITHUB_PREFIX) ? item.url : null,
    mergedAt: item.mergedAt,
  }));
}
