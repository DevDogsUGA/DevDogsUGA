"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { MagnifyingGlassIcon, UserPlusIcon } from "@phosphor-icons/react/ssr";
import {
  addAttendee,
  cancelInvite,
  findAttendee,
  inviteAttendee,
  removeAttendee,
  resendInvite,
  type AttendeeLookup,
} from "~/server/actions/officerAttendance";
import { Button } from "~/ui/button";
import { useCommand, CommandFeedback } from "~/ui/use-command";
import type { ActionResult } from "~/lib/actionResult";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "~/ui/input-group";
import { UGA_DOMAIN } from "~/lib/attendanceInvite";
import "./meeting-detail.css";

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
    <div className="md-add">
      <form onSubmit={submit(find)} className="md-add-form">
        <label htmlFor="md-myid" className="label">
          Add by MyID
        </label>
        <div className="md-add-row">
          <InputGroup className="md-myid">
            <InputGroupInput
              id="md-myid"
              name="myId"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              placeholder="MyID"
              required
              onChange={() => setDismissed(found)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>@{UGA_DOMAIN}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <Button type="submit" variant="outline" loading={finding}>
            <MagnifyingGlassIcon weight="bold" aria-hidden />
            Look up
          </Button>
        </div>
        <span className="help">
          Type only the MyID. Names are never typed: an existing account shows
          its name to confirm.
        </span>
      </form>

      <CommandFeedback result={found} />

      {showQuestion && question.status === "confirm" && (
        <form onSubmit={submit(add)} className="md-confirm" aria-live="polite">
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="myId" value={question.myId} />
          <p>
            <b>{question.name}</b> ({question.myId}@{UGA_DOMAIN}) has an
            account. Record them at this meeting?
          </p>
          <Button type="submit" loading={adding}>
            <UserPlusIcon weight="bold" aria-hidden />
            Record {question.name}
          </Button>
        </form>
      )}

      {showQuestion && question.status === "invite" && (
        <form
          onSubmit={submit(invite)}
          className="md-confirm"
          aria-live="polite"
        >
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="myId" value={question.myId} />
          <p>
            <b>{question.email}</b> has no account yet. Email a link that
            records them once they sign in with that UGA address? It works once
            and expires in 14 days.
          </p>
          <Button type="submit" loading={inviting}>
            <UserPlusIcon weight="bold" aria-hidden />
            Send invite
          </Button>
        </form>
      )}

      {outcome && (
        <>
          <CommandFeedback result={outcome} />
          <Button type="button" variant="outline" size="sm" onClick={onAnother}>
            Add another
          </Button>
        </>
      )}
    </div>
  );
}

/** One form-button that posts `fields` to `action` and reports the outcome. */
function ActionButton({
  action,
  fields,
  variant,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  variant: "outline" | "destructive";
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
      className="md-inline-form"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" size="sm" variant={variant} loading={pending}>
        {children}
      </Button>
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
    <div className="md-acts">
      <ActionButton action={resendInvite} fields={fields} variant="outline">
        Resend<span className="sr-only"> invite to {who}</span>
      </ActionButton>
      <ActionButton action={cancelInvite} fields={fields} variant="destructive">
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
    <details className="md-remove">
      <summary className="btn secondary sm">
        Remove<span className="sr-only"> {who}</span>
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          run(formData);
        }}
        className="md-remove-form"
      >
        <input type="hidden" name="meetingId" value={meetingId} />
        <input type="hidden" name="attendanceId" value={attendanceId} />
        <label className="label" htmlFor={`reason-${attendanceId}`}>
          Reason (optional)
        </label>
        <textarea
          id={`reason-${attendanceId}`}
          name="reason"
          rows={2}
          maxLength={500}
          className="md-reason"
        />
        <span className="help">
          Their reflections and survey answers stay. Bevy and Engage need fixing
          by hand afterward.
        </span>
        <Button
          type="submit"
          size="sm"
          variant="danger-solid"
          loading={pending}
        >
          Remove {who}
        </Button>
        <CommandFeedback result={result} />
      </form>
    </details>
  );
}
