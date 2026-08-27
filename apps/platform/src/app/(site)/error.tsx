"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";

/**
 * The boundary for every page in the site layout that does not bring its own —
 * the console, the account and tools pages, voting, teams and competitions.
 * The events segment has its own; see `events/error.tsx`.
 *
 * Until this existed, a loader that threw — a database that went away
 * mid-request, a Supabase token that failed to refresh — put Next's unstyled
 * default error screen in front of an officer, which reads as the site being
 * gone rather than one read having failed.
 *
 * The digest is the only handle on what actually happened: a Server
 * Component's error reaches the client stripped of its message, and the digest
 * is what ties the screenshot somebody sends us to the line in the server log.
 */
export default function SiteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative isolate mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16 @sm:px-6">
      <h1 className="font-display text-3xl font-bold text-rose-300">
        That did not load
      </h1>
      <p className="max-w-prose text-sm text-mauve-300">
        Something this page needed failed to come back. Nothing you did caused
        it and nothing was saved incorrectly — trying again is usually enough,
        because the failure is almost always one read rather than the service.
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          onClick={() => retry()}
          className="rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-sm text-mauve-400 underline-offset-4 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
        >
          Back to the homepage
        </Link>
      </div>
      {error.digest && (
        <p className="pt-2 font-mono text-xs text-mauve-500">
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
