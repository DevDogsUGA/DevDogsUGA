"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { TeamProblem } from "~/components/teams/outcome";
import type { TeamActionOutcome, TeamProblemCode } from "~/server/teams/errors";

/**
 * Answer one invitation or one join request.
 *
 * `blocked` is the interesting prop. Acceptance is validated when it is
 * answered, never when it was created — between the two, the team can fill up,
 * the roster can lock, or the person can join somebody else — so a row that
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
      // Settled in place rather than refreshed away. The row would vanish on a
      // refresh — which is technically correct and reads as the click having
      // done nothing, so the answer is stated where the buttons were.
      if (result.ok) setSettled(accept ? "accepted" : "declined");
      else setProblem(result.code);
    });
  }

  if (settled === "accepted") {
    return (
      <p role="status" className="text-sm font-semibold">
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
      <p role="status" className="text-sm opacity-70">
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
            className="rounded-sm border-2 border-black bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {isPending ? "Working…" : "Accept"}
          </button>
        )}
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={isPending}
          className="rounded-sm border-2 border-black px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
        >
          {blocked ? "Dismiss" : "Decline"}
        </button>
      </div>
      {problem && <TeamProblem code={problem} />}
    </div>
  );
}
