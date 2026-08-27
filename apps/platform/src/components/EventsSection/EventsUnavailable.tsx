import {
  ArrowClockwiseIcon,
  ArrowUpRightIcon,
} from "@phosphor-icons/react/ssr";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";

/**
 * What the events page says when it cannot read the schedule.
 *
 * Shared by two callers that catch different failures, which is the whole
 * reason it is its own module.
 *
 * `error.tsx` catches throws from `page.tsx` and the segments below it — a
 * meeting's own dialog, mainly. It does NOT catch the schedule, because the
 * schedule is rendered by `layout.tsx`, and the Next docs are explicit that
 * `error.js` "does not wrap the layout.js or template.js above it in the same
 * segment". A throw there would sail past this boundary to the `(site)` parent
 * and take out the nav and footer with it.
 *
 * The schedule cannot move to `page.tsx` to fix that: it lives in the layout
 * so it stays mounted behind `/events/directions` and `/events/[slug]`, which
 * is what makes those dialogs open over a calendar that never re-renders. So
 * the layout catches its own read instead and renders this directly, and the
 * two paths share one fallback rather than drifting into two.
 *
 * It degrades rather than apologises. The club's meetings are also listed on
 * the UGA Involvement Network — a different host on a different database, so
 * it is still up when ours is not. That link is the point: somebody who came
 * for the date should leave with the date. Retrying is the second-best outcome.
 */
export default function EventsUnavailable({
  digest,
  retry,
}: {
  /** The server error's digest, when there is one. A hash, never the message. */
  digest?: string;
  /**
   * Present only when a React error boundary is what caught this, since only
   * a client component can hand over a callback. The layout's own `try`/`catch`
   * has nothing equivalent, so it gets the reload link below instead.
   */
  retry?: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 @sm:px-6">
      <section className="overflow-hidden rounded-xl border-2 border-mauve-800 bg-mauve-950 shadow-lg shadow-black/30">
        <div className="space-y-6 px-6 py-10 md:px-12 md:py-14">
          <div className="max-w-prose space-y-4">
            <h2 className="font-display text-3xl font-extrabold text-white md:text-4xl">
              The schedule could not be loaded
            </h2>
            <p className="text-base/relaxed text-mauve-300">
              This page reads meetings from the club database, and that read
              failed. Nothing has changed about the meetings themselves.
            </p>
            <p className="text-base/relaxed text-mauve-300">
              Try again in a moment, or read the same schedule on the UGA
              Involvement Network, which is where RSVPs live anyway.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {retry ? (
              // `retry()` re-fetches and re-renders the boundary's children.
              // The Next 16 docs single it out over `reset()`, which only
              // clears the error state without re-running the read — so the
              // same failure renders again with nothing having been retried.
              <button
                type="button"
                onClick={() => retry()}
                className="flex items-center gap-2 rounded-sm border-2 border-white bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-transparent hover:text-white"
              >
                <ArrowClockwiseIcon /> Try again
              </button>
            ) : (
              /* eslint-disable-next-line @next/next/no-html-link-for-pages --
                 The rule exists to stop a full reload where a client navigation
                 would do. Here the full reload IS the point: the router would
                 re-use the same failed render and the button would do nothing
                 visible, which is worse than not offering it. `<Link>` is the
                 right default and the wrong tool for retrying a failed read. */
              <a
                href="/events"
                className="flex items-center gap-2 rounded-sm border-2 border-white bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-transparent hover:text-white"
              >
                <ArrowClockwiseIcon /> Reload the page
              </a>
            )}
            <a
              href={INVOLVEMENT_NETWORK_EVENTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-mauve-600 bg-mauve-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white"
            >
              Events on the Involvement Network <ArrowUpRightIcon />
            </a>
          </div>

          {/* The digest is a hash, not the error: it carries nothing about what
              went wrong, and it is the only handle matching this failure to a
              line in the server logs. Worth printing small; the message and the
              stack are not, and in production the message is a placeholder. */}
          {digest && (
            <p className="font-mono text-xs text-mauve-400">
              Reference {digest} — quote this if you email us about it.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
