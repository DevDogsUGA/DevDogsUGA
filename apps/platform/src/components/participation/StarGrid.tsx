import "./passport.css";

import { formatEventDate } from "~/lib/eventTime";
import type { StarCell } from "~/server/loaders/stars";
import EmptyState from "./EmptyState";

/** The member's earned meeting stars, newest first (`attendance.html` passport rows). */
export default function StarGrid({ cells }: { cells: StarCell[] }) {
  if (cells.length === 0) {
    return (
      <EmptyState
        title="No participation recorded yet"
        body="Stars appear here after you attend a workshop night."
      />
    );
  }

  return (
    <ol className="att-rows">
      {cells.map((cell) => (
        <li key={cell.meetingId}>
          <span className="att-st" role="img" aria-label="Credit earned">
            ★
          </span>
          <span className="att-t">{cell.label}</span>
          <time className="att-d" dateTime={cell.startsAt.toISOString()}>
            {formatEventDate(cell.startsAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
