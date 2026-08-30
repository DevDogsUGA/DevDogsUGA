"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { TeamProblem } from "~/components/teams/outcome";
import type { TeamActionOutcome, TeamProblemCode } from "~/server/teams/errors";

/**
 * Answer one invitation or one join request.
 *
 * `blocked` is the interesting prop. Acceptance is validated when it is
 * answered, never when it was created. Between the two, the team can fill up,
 * the roster can lock, or the person can join somebody else, so a row that
 * looks answerable may not be. The page works out whether accepting can still
 * succeed and says why above this component; here that only removes the
 * button, so nobody presses something that was always going to fail.
 *
 * Declining stays available in every case. `respondToMembership` marks a
 * decline without consulting the roster lock, and a dead row that cannot be
 * cleared would sit in this list until it expired.
 */
export default function RequestActions({
  requestId,
  direction,
  subject,
  teamHref,
  blocked,
  respond,
}: {
  requestId: string;
  direction: "invite" | "request";
  /** The team, for an invitation; the person, for a request. */
  subject: string;
  teamHref: string;
  blocked: boolean;
  respond: (
    requestId: string,
    accept: boolean,
  ) => Promise<TeamActionOutcome<void>>;
}) {
  const [settled, setSettled] = useState<"accepted" | "declined" | null>(null);
  const [problem, setProblem] = useState<TeamProblemCode | null>(null);
  const [isPending, startTransition] = useTransition();

  function answer(accept: boolean) {
    setProblem(null);
    startTransition(async () => {
      const result = await respond(requestId, accept);
      // Settled in place rather than refreshed away. The row would vanish on
      // a refresh, which is correct and reads as the click having done
      // nothing, so the answer is stated where the buttons were.
      if (result.ok) setSettled(accept ? "accepted" : "declined");
      else setProblem(result.code);
    });
  }

  if (settled === "accepted") {
    return (
      <p role="status" className="text-sm font-semibold text-white">
        {direction === "invite" ? (
          <>
            You are on {subject}.{" "}
            <Link href={teamHref} className="underline">
              Open the team
            </Link>
            .
          </>
        ) : (
          <>{subject} is on the team.</>
        )}
      </p>
    );
  }

  if (settled === "declined") {
    return (
      <p role="status" className="text-sm text-mauve-400">
        Declined.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex gap-2">
        {!blocked && (
          <button
            type="button"
            onClick={() => answer(true)}
            disabled={isPending}
            className="rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
          >
            {isPending ? "Working…" : "Accept"}
          </button>
        )}
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={isPending}
          className="rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-1 text-sm font-medium text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950 disabled:opacity-40"
        >
          {blocked ? "Dismiss" : "Decline"}
        </button>
      </div>
      {problem && <TeamProblem code={problem} />}
    </div>
  );
}
