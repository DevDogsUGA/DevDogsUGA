import "./contributions.css";

import { formatEventDate } from "~/lib/eventTime";
import type { CommitItem } from "~/server/loaders/commits";
import { TextLink } from "~/ui/text-link";
import { contributionRows } from "./view";

/**
 * Commits, newest first, each linked to its commit on GitHub. Whoever renders
 * it decides who may see the list: the public profile passes only a public
 * member's commits in available repositories, /dashboard/attendance passes the
 * signed-in member's own.
 */
export default function ContributionList({
  items,
  empty = "No commits yet.",
}: {
  items: readonly CommitItem[];
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
              {row.repo}@{row.short}
            </span>
          </span>
          <time className="ct-date" dateTime={row.committedAt.toISOString()}>
            {formatEventDate(row.committedAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
