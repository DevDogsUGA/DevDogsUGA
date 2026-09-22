"use client"; // Error boundaries must be Client Components

import { DogDaysMark } from "@devdogsuga/og";
import Link from "next/link";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * The app-wide boundary: every route this app has -- plans, courses,
 * settings, the questionnaire, manual entry, and everything else under
 * `src/app` -- falls back to this when a Server Component render, a loader,
 * or a Server Action throws. There is no route-group segment with its own
 * boundary the way platform's `(site)`/`events` split has one each, so one
 * file covers the whole tree. It deliberately does NOT cover the root layout
 * itself; that failure has no shell left to render into and falls through to
 * `global-error.tsx` instead.
 *
 * Styled with DogDays' own tokens (stock red primary, pink/navy-washed
 * background, `not-found.tsx`'s mark-plus-CTA layout), not platform's mauve
 * palette -- this app's `globals.css` defines those as semantic Tailwind
 * utilities, so this file gets the same `dark:`-aware classes as the rest of
 * the app.
 *
 * The digest is the only handle on what happened: a Server Component's error
 * reaches the client stripped of its message, and the digest ties whatever
 * screenshot we get to the line in the server log.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // captureException is safe unconditionally -- it no-ops with no DSN
    // configured, same contract as every other Sentry call in this app.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <span className="text-edge-strong">
        <DogDaysMark size={64} color="currentColor" />
      </span>
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        That did not load
      </h1>
      <p className="text-muted max-w-md text-balance">
        Something this page needed failed to come back. Nothing you did caused
        it and nothing was saved incorrectly — trying again is usually enough,
        because the failure is almost always one read rather than the service.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="bg-primary hover:bg-primary-strong rounded-lg px-6 py-2.5 font-semibold text-white transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-muted hover:text-foreground text-sm underline-offset-4 transition-colors hover:underline"
        >
          Back Home
        </Link>
      </div>
      {error.digest && (
        <p className="text-muted/70 font-mono text-xs">
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
