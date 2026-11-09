"use client";

import { useState } from "react";
import {
  cancelMemberDeletion,
  requestAccountDeletion,
} from "~/server/actions/accountDeletion";
import FormButton from "~/classic/components/FormButton";
import Input from "~/classic/components/Input";
import Callout from "~/classic/ui/callout";
import Field from "~/classic/ui/field";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";
import { confirmationMatches, OFFICER_DELETE_PHRASE } from "./confirm";

export type PendingDeletionView = {
  /** Already formatted for reading ("Friday, November 6, 2026"). */
  date: string;
  /** The job has begun: it can no longer be cancelled. */
  started: boolean;
  /** Who asked, in words. */
  requestedBy: "member" | "officer";
};

/**
 * The console's account-deletion controls on a member's page
 * (account-deletion Q13). Shown only to officers holding `canDeleteAccounts`;
 * the actions check the permission again on the server, as the officer.
 *
 * With nothing pending: an optional reason, a typed confirmation and a button
 * that schedules the same 14-day deletion the member can ask for. With a
 * deletion pending: its date, and a button to cancel it until the job starts.
 */
export default function ScheduleDeletionPanel({
  targetUserId,
  memberName,
  pending: pendingDeletion,
}: {
  targetUserId: string;
  memberName: string;
  pending: PendingDeletionView | null;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const schedule = useCommand(async (note: string) => {
    const result = await requestAccountDeletion(targetUserId, note);
    if (result.ok) {
      setReason("");
      setTyped("");
    }
    return result;
  });
  const cancel = useCommand(() => cancelMemberDeletion(targetUserId));

  if (pendingDeletion) {
    return (
      <div className="flex flex-col gap-4">
        <Callout
          tone="warning"
          title={`Scheduled for deletion on ${pendingDeletion.date}.`}
        >
          {pendingDeletion.requestedBy === "officer"
            ? "An officer scheduled this. "
            : "The member asked for this. "}
          {pendingDeletion.started
            ? "The deletion has started and can no longer be cancelled."
            : "Until then they are signed out and hidden from the community. Cancelling restores everything."}
        </Callout>
        <CommandFeedback result={cancel.result} />
        {!pendingDeletion.started && (
          <FormButton
            theme="black"
            type="button"
            className="w-fit text-sm"
            disabled={cancel.pending}
            onClick={() => cancel.run()}
          >
            Cancel deletion
          </FormButton>
        )}
      </div>
    );
  }

  const confirmed = confirmationMatches(typed, OFFICER_DELETE_PHRASE);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirmed) return;
        schedule.run(reason);
      }}
    >
      <p className="m-0 text-sm text-mauve-300">
        Schedules {memberName}&apos;s account for deletion in 14 days. They are
        signed out and hidden from the community now, get an email at their UGA
        address, and can undo it by signing in until the time is up. Their
        attendance stays in the club&apos;s totals without their name; their
        reflections, survey answers and OAuth apps are erased.
      </p>
      <Field
        label="Reason (optional)"
        htmlFor="schedule-deletion-reason"
        description="Kept with the deletion for the officers. Not sent to the member."
      >
        <Input
          id="schedule-deletion-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          autoComplete="off"
        />
      </Field>
      <Field
        label={`Type "${OFFICER_DELETE_PHRASE}" to confirm`}
        htmlFor="schedule-deletion-confirm"
      >
        <Input
          id="schedule-deletion-confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <CommandFeedback result={schedule.result} />
      <FormButton
        theme="rose"
        type="submit"
        className="w-fit text-sm"
        disabled={!confirmed || schedule.pending}
      >
        Schedule deletion
      </FormButton>
    </form>
  );
}
