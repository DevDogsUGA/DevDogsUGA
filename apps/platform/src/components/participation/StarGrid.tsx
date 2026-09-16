import { formatEventDate } from "~/lib/eventTime";
import type { StarCell } from "~/server/loaders/stars";
import EmptyState from "./EmptyState";

/** A compact passport of the member's earned meeting and competition stars. */
export default function StarGrid({ cells }: { cells: StarCell[] }) {
  if (cells.length === 0) {
    return (
      <EmptyState
        title="No participation recorded yet"
        body="Stars appear here after an eligible meeting attendance or competition participation is recorded."
      />
    );
  }

  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {cells.map((cell) => (
        <li
          key={`${cell.activityType}:${cell.activityId}`}
          className="rounded-lg border border-white/10 bg-white/5 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-wide text-mauve-400 uppercase">
                {cell.activityType === "meeting" ? "Meeting" : "Competition"}
              </p>
              <h3 className="font-semibold text-white">{cell.label}</h3>
              <time
                className="text-xs text-mauve-400"
                dateTime={cell.startsAt.toISOString()}
              >
                {formatEventDate(cell.startsAt)}
              </time>
            </div>
            <span
              className="text-2xl text-amber-300"
              role="img"
              aria-label={
                cell.won ? "Star earned; competition won" : "Star earned"
              }
            >
              {cell.won ? "♛" : "★"}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
