"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  addAttendee,
  cancelInvite,
  findAttendee,
  inviteAttendee,
  removeAttendee,
  resendInvite,
  type AttendeeLookup,
} from "~/server/actions/officerAttendance";
import FormButton from "~/classic/components/FormButton";
import { useCommand, CommandFeedback } from "~/classic/ui/use-command";
import type { ActionResult } from "~/lib/actionResult";
import { UGA_DOMAIN } from "~/lib/attendanceInvite";

const INPUT =
  "rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40";

/**
 * Officer check-in (Q8, Q51): a MyID with `@uga.edu` fixed after it, never a
 * name. Look up first (writes nothing), then confirm: an existing account
 * shows its name and records at once, an address with no account sends a
 * claim link.
 */
export function AddAttendeeForm({ meetingId }: { meetingId: string }) {
  const [round, setRound] = useState(0);
  return (
    <AddAttendee
      key={round}
      meetingId={meetingId}
      onAnother={() => setRound((n) => n + 1)}
    />
  );
}

function AddAttendee({
  meetingId,
  onAnother,
}: {
  meetingId: string;
  onAnother: () => void;
}) {
  const {
    result: found,
    run: find,
    pending: finding,
  } = useCommand(findAttendee, { refresh: false });
  const { result: added, run: add, pending: adding } = useCommand(addAttendee);
  const {
    result: invited,
    run: invite,
    pending: inviting,
  } = useCommand(inviteAttendee);
  const [dismissed, setDismissed] =
    useState<ActionResult<AttendeeLookup> | null>(null);

  function submit(
    action: (formData: FormData) => void,
  ): (event: FormEvent<HTMLFormElement>) => void {
    return (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      action(formData);
    };
  }

  // A confirmation result replaces the pending question it answered.
  const outcome = added ?? invited;
  const question = found?.ok ? (found.data ?? null) : null;
  const showQuestion = question !== null && dismissed !== found && !outcome;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit(find)} className="flex flex-col gap-1">
        <label htmlFor="md-myid" className="text-xs font-medium text-white/70">
          Add by MyID
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2">
            <input
              id="md-myid"
              name="myId"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              placeholder="MyID"
              required
              onChange={() => setDismissed(found)}
              className={INPUT}
            />
            <span className="text-sm text-mauve-400">@{UGA_DOMAIN}</span>
          </span>
          <FormButton
            theme="black"
            type="submit"
            disabled={finding}
            className="text-sm"
          >
            Look up
          </FormButton>
        </div>
        <span className="text-xs text-mauve-400">
          Type only the MyID. Names are never typed: an existing account shows
          its name to confirm.
        </span>
      </form>

      <CommandFeedback result={found} />

      {showQuestion && question.status === "confirm" && (
        <form
          onSubmit={submit(add)}
          className="flex flex-col items-start gap-3"
          aria-live="polite"
        >
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="myId" value={question.myId} />
          <p className="text-sm text-mauve-200">
            <b className="text-white">{question.name}</b> ({question.myId}@
            {UGA_DOMAIN}) has an account. Record them at this meeting?
          </p>
          <FormButton
            theme="cyan"
            type="submit"
            disabled={adding}
            className="text-sm"
          >
            Record {question.name}
          </FormButton>
        </form>
      )}

      {showQuestion && question.status === "invite" && (
        <form
          onSubmit={submit(invite)}
          className="flex flex-col items-start gap-3"
          aria-live="polite"
        >
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="myId" value={question.myId} />
          <p className="text-sm text-mauve-200">
            <b className="text-white">{question.email}</b> has no account yet.
            Email a link that records them once they sign in with that UGA
            address? It works once and expires in 14 days.
          </p>
          <FormButton
            theme="cyan"
            type="submit"
            disabled={inviting}
            className="text-sm"
          >
            Send invite
          </FormButton>
        </form>
      )}

      {outcome && (
        <>
          <CommandFeedback result={outcome} />
          <button
            type="button"
            onClick={onAnother}
            className="w-fit rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1.5 text-sm text-white transition-colors hover:border-white"
          >
            Add another
          </button>
        </>
      )}
    </div>
  );
}

/** One form-button that posts `fields` to `action` and reports the outcome. */
function ActionButton({
  action,
  fields,
  theme,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  theme: "black" | "rose";
  children: ReactNode;
}) {
  const { result, run, pending } = useCommand(action);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        run(formData);
      }}
      className="flex flex-col items-start gap-2"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FormButton
        theme={theme}
        type="submit"
        disabled={pending}
        className="text-xs"
      >
        {children}
      </FormButton>
      <CommandFeedback result={result} />
    </form>
  );
}

export function InviteActions({
  meetingId,
  inviteId,
  who,
}: {
  meetingId: string;
  inviteId: string;
  who: string;
}) {
  const fields = { meetingId, inviteId };
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton action={resendInvite} fields={fields} theme="black">
        Resend<span className="sr-only"> invite to {who}</span>
      </ActionButton>
      <ActionButton action={cancelInvite} fields={fields} theme="rose">
        Cancel<span className="sr-only"> invite to {who}</span>
      </ActionButton>
    </div>
  );
}

/**
 * Removal (Q9): behind a disclosure, with an optional reason that lands in the
 * audit log. Reflections and survey answers stay.
 */
export function RemoveAttendee({
  meetingId,
  attendanceId,
  who,
}: {
  meetingId: string;
  attendanceId: string;
  who: string;
}) {
  const { result, run, pending } = useCommand(removeAttendee);
  return (
    <details>
      <summary className="w-fit cursor-pointer rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1 text-xs text-white transition-colors hover:border-white">
        Remove<span className="sr-only"> {who}</span>
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          run(formData);
        }}
        className="mt-3 flex flex-col items-start gap-2"
      >
        <input type="hidden" name="meetingId" value={meetingId} />
        <input type="hidden" name="attendanceId" value={attendanceId} />
        <label
          className="text-xs font-medium text-white/70"
          htmlFor={`reason-${attendanceId}`}
        >
          Reason (optional)
        </label>
        <textarea
          id={`reason-${attendanceId}`}
          name="reason"
          rows={2}
          maxLength={500}
          className={`${INPUT} w-full min-w-56 resize-none`}
        />
        <span className="text-xs text-mauve-400">
          Their reflections and survey answers stay. Bevy and Engage need fixing
          by hand afterward.
        </span>
        <FormButton
          theme="rose"
          type="submit"
          disabled={pending}
          className="text-xs"
        >
          Remove {who}
        </FormButton>
        <CommandFeedback result={result} />
      </form>
    </details>
  );
}
