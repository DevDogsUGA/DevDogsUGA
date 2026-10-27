import "./contributions.css";

import { formatEventDate } from "~/lib/eventTime";
import type { ContributionItem } from "~/server/loaders/contributions";
import { TextLink } from "~/ui/text-link";
import { contributionRows } from "./view";

/**
 * Merged pull requests, newest first, each linked to its pull request on
 * GitHub. Whoever renders it decides who may see the list: the public profile
 * passes only a public member's public-repository PRs, /attendance passes the
 * signed-in member's own.
 */
export default function ContributionList({
  items,
  empty = "No merged pull requests yet.",
}: {
  items: readonly ContributionItem[];
  empty?: string;
}) {
  const rows = contributionRows(items);
  if (rows.length === 0) return <p className="ct-empty">{empty}</p>;
  return (
    <ul className="ct-list">
      {rows.map((row) => (
        <li key={row.key} className="ct-item">
          <span className="ct-title">
            {row.href ? (
              <TextLink href={row.href} target="_blank" rel="noreferrer">
                {row.label}
              </TextLink>
            ) : (
              row.label
            )}
            <span className="ct-repo">
              {row.repo} #{row.number}
            </span>
          </span>
          <time className="ct-date" dateTime={row.mergedAt.toISOString()}>
            {formatEventDate(row.mergedAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
