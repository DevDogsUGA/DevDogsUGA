import "./badges.css";

import { formatEventDate } from "~/lib/eventTime";
import Badge from "~/ui/badge";
import {
  multiplierLabel,
  type BadgeAwardView,
  type BadgeEntry,
} from "~/server/badges/display";

/**
 * A member's badges, each with its count and (on click) its dated awards.
 * A badge is a record of something done, not an assessed skill, and the copy
 * says no more than the badge's description. The citation of a manual award
 * shows under its date; a hidden badge arrives here without one.
 *
 * Whoever renders it decides what is in `entries` (live and un-hidden for a
 * public profile; everything for an officer); `actions` renders extra
 * per-award controls (withdraw, for the console).
 */
export default function BadgeList({
  entries,
  empty = "No badges yet.",
  actions,
}: {
  entries: readonly BadgeEntry[];
  empty?: string;
  actions?: (award: BadgeAwardView, entry: BadgeEntry) => React.ReactNode;
}) {
  if (entries.length === 0) return <p className="bdg-empty">{empty}</p>;
  return (
    <ul className="bdg-list">
      {entries.map((entry) => {
        const multiplier = multiplierLabel(entry);
        return (
          <li key={entry.key} className="bdg-item">
            <div className="bdg-head">
              <span className="bdg-name">{entry.name}</span>
              {multiplier && (
                <span
                  className="bdg-multiplier"
                  aria-label={`awarded ${entry.count} times`}
                >
                  {multiplier}
                </span>
              )}
              {entry.hidden && <Badge>Hidden</Badge>}
            </div>
            {entry.description && (
              <p className="bdg-desc">{entry.description}</p>
            )}
            <details className="bdg-dates">
              <summary>
                {entry.awards.length === 1 ? "Awarded" : "Awarded on"}{" "}
                {entry.awards.length === 1
                  ? formatEventDate(entry.awards[0]!.awardedAt)
                  : `${entry.awards.length} dates`}
              </summary>
              <ul className="bdg-awards">
                {entry.awards.map((award) => (
                  <li key={award.id} className="bdg-award">
                    <time dateTime={award.awardedAt.toISOString()}>
                      {formatEventDate(award.awardedAt)}
                    </time>
                    {award.citation && (
                      <p className="bdg-citation">{award.citation}</p>
                    )}
                    {award.awardedByLabel && (
                      <p className="bdg-by">
                        awarded by {award.awardedByLabel}
                      </p>
                    )}
                    {award.withdrawnAt && (
                      <p className="bdg-withdrawn">
                        withdrawn {formatEventDate(award.withdrawnAt)}:{" "}
                        {award.withdrawnReason}
                      </p>
                    )}
                    {!award.withdrawnAt && actions?.(award, entry)}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
