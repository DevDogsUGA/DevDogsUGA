"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CheckInCode, CheckInOutcome } from "~/server/attendance/errors";

/**
 * The check-in box.
 *
 * One field, and it is the code. There is deliberately no meeting or workshop
 * picker: the code identifies the room, so there is nothing here for a member
 * to pick wrong and no way to claim the session they were not in by choosing it
 * from a list. That is the entire security model of check-in, and it only holds
 * as long as this form asks for nothing else.
 */

/**
 * What the page's wrapper hands back.
 *
 * A value rather than a thrown `CheckInError`, because a server function that
 * throws reaches the browser as an opaque digest in production — the `.code`
 * that decides which of the three messages below to show does not survive the
 * boundary. See the wrapper in the meeting page.
 */
const PROBLEM_MESSAGES: Record<CheckInCode, string> = {
  code_not_found:
    "That code is not one of ours. Check it against the screen at the front of the room — codes rotate during the meeting.",
  check_in_closed:
    "Check-in has closed for this meeting. Ask an officer to add you to the roster.",
  // Not a failure the member caused, and not one they can act on. Phrased as
  // the reassurance it is, and rendered below as a status rather than an error.
  already_checked_in: "You are already checked in for this meeting.",
};

export default function CheckInForm({
  redeem,
}: {
  redeem: (code: string) => Promise<CheckInOutcome>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const [isPending, startTransition] = useTransition();

  // A second redemption is not an error state to recover from — the member is
  // on the roster either way, which is the only thing they came here to find
  // out. Both cases retire the form so nobody re-submits a code that worked.
  const settled =
    outcome !== null && (outcome.ok || outcome.error === "already_checked_in");

  if (settled) {
    return (
      <p
        role="status"
        className="rounded-sm border-2 border-black bg-green-50 p-4 text-sm"
      >
        {outcome.ok
          ? "Checked in. Your star for this meeting is on your record already — stars are derived from attendance, so there is nothing else to do."
          : PROBLEM_MESSAGES.already_checked_in}
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setOutcome(null);
        startTransition(async () => {
          const result = await redeem(code);
          setOutcome(result);
          // The attendance count, the star grid and every "you were here" on
          // the page behind this form were rendered before the row existed.
          if (result.ok) router.refresh();
        });
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Check-in code</span>
        <input
          value={code}
          // Upper-cased as it is typed purely so the field matches the code
          // projected at the front of the room. The action normalizes too — a
          // member typing lowercase on a phone keyboard is not a failed
          // check-in, and this must never become the thing that decides it.
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={outcome !== null && !outcome.ok}
          className="rounded-sm border-2 border-black bg-white px-3 py-2 font-mono tracking-widest uppercase"
        />
      </label>

      <button
        type="submit"
        disabled={isPending || code.trim() === ""}
        className="rounded-sm border-2 border-black bg-black px-4 py-2 font-semibold text-white disabled:opacity-40"
      >
        {isPending ? "Checking in…" : "Check in"}
      </button>

      {outcome !== null && !outcome.ok && (
        <p role="alert" className="w-full text-sm font-semibold text-red-700">
          {PROBLEM_MESSAGES[outcome.error]}
        </p>
      )}
    </form>
  );
}
