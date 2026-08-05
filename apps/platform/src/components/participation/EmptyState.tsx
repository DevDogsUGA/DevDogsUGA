import type { ReactNode } from "react";

/**
 * Nothing here, and why.
 *
 * Always takes a reason rather than only a title. Most empty states on this
 * platform are temporal — no meetings scheduled *yet*, no results *until the
 * tally runs*, no teams *until somebody makes one* — and "No meetings" alone
 * reads as a fault in the page rather than as the current state of the club.
 */
export default function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-sm border-2 border-dashed border-black/30 bg-white/60 p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="max-w-prose text-sm opacity-70">{body}</p>
      {action}
    </div>
  );
}
