"use client";

import { useState, useTransition } from "react";
import type {
  CastBallotError,
  CastBallotResult,
} from "~/server/actions/elections";

/**
 * The ranking form.
 *
 * Reordering is buttons, not drag-and-drop. Dragging is the obvious choice and
 * the wrong one here: it is unusable with a keyboard, awkward on the phone
 * half these ballots are cast from, and invisible to a screen reader without a
 * parallel control that would then be the real interface. Move-up/move-down is
 * the parallel control, so it is the only one.
 */

export interface BallotOptionView {
  teamId: string;
  teamName: string;
  submissionUrl: string | null;
  isOwnTeam: boolean;
}

const PROBLEM_MESSAGES: Record<CastBallotError, string> = {
  not_open: "Voting has closed for this election.",
  not_eligible: "You are not eligible to vote in this election.",
  already_voted: "A ballot has already been cast.",
  no_team: "You are not on a team in this competition.",
  not_the_lead: "Your team lead casts this ballot.",
  incomplete: "Every team has to be ranked.",
  duplicate: "A team appears twice in the ranking.",
  unknown_team: "That ranking includes a team not on this ballot.",
  untouched: "Put the teams in the order you want before submitting.",
};

export default function BallotForm({
  electionId,
  options,
  castBallot,
}: {
  electionId: string;
  /** Already in presented order — shuffled per voter, own team pinned. */
  options: BallotOptionView[];
  castBallot: (
    electionId: string,
    ranking: string[],
    touched: boolean,
  ) => Promise<CastBallotResult>;
}) {
  const [order, setOrder] = useState(options);
  const [touched, setTouched] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
    setTouched(true);
  }

  // Either reordering OR explicitly confirming counts. A voter who genuinely
  // agrees with the shuffle they were given must have a way through that is
  // not "drag one item and put it back" — the point is that submitting is a
  // decision, not that it is laborious.
  const canSubmit = (touched || confirmed) && !isPending && !done;

  if (done) {
    return (
      <p
        role="status"
        className="rounded-sm border-2 border-black bg-green-50 p-4 text-sm"
      >
        Ballot cast. You can see what you submitted below.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await castBallot(
            electionId,
            order.map((o) => o.teamId),
            touched || confirmed,
          );
          if (result.ok) setDone(true);
          else setError(PROBLEM_MESSAGES[result.error]);
        });
      }}
      className="flex flex-col gap-4"
    >
      <ol className="flex flex-col gap-2">
        {order.map((option, index) => (
          <li
            key={option.teamId}
            className="flex items-center gap-3 rounded-sm border-2 border-black bg-white p-3"
          >
            <span
              aria-hidden
              className="w-6 shrink-0 text-center text-lg font-bold tabular-nums"
            >
              {index + 1}
            </span>

            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">
                {option.teamName}
                {option.isOwnTeam && (
                  <span className="ml-2 text-xs font-normal opacity-70">
                    your team
                  </span>
                )}
              </span>
              {option.submissionUrl && (
                <a
                  href={option.submissionUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate text-xs underline opacity-70"
                >
                  View the submission
                </a>
              )}
            </span>

            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                // The rank is in the label rather than the position, because
                // "move up" alone tells a screen reader nothing about what
                // just happened or what will.
                aria-label={`Move ${option.teamName} to position ${index}`}
                className="rounded-sm border-2 border-black px-2 py-1 text-sm disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === order.length - 1}
                aria-label={`Move ${option.teamName} to position ${index + 2}`}
                className="rounded-sm border-2 border-black px-2 py-1 text-sm disabled:opacity-30"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>

      {!touched && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            This order is what I want. (The list started in a random order, so
            submitting without looking would not mean anything.)
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="self-start rounded-sm border-2 border-black bg-black px-4 py-2 font-semibold text-white disabled:opacity-40"
      >
        {isPending ? "Casting…" : "Cast ballot"}
      </button>

      <p className="text-xs opacity-70">
        A ballot cannot be changed once cast.
      </p>
    </form>
  );
}
