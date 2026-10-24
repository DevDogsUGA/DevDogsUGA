"use client";

import "./projects.css";

import { useActionState } from "react";
import {
  reviewReportAction,
  type ProjectActionState,
} from "~/server/actions/projects";
import { cn } from "~/lib/cn";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";

const initialState: ProjectActionState = { ok: false, message: "" };

/**
 * Approve a report (confirming the hours or adjusting them) or return it with
 * a note. Both go through one action; the button picks the intent.
 */
export default function ReviewForm({
  reportId,
  claimedHours,
}: {
  reportId: string;
  claimedHours: number;
}) {
  const [state, action, pending] = useActionState(
    reviewReportAction,
    initialState,
  );
  return (
    <form action={action} className="prj-form">
      <input type="hidden" name="reportId" value={reportId} />
      <Field
        label="Hours to approve"
        htmlFor={`prj-approve-${reportId}`}
        description="Confirm the claim or adjust it. Quarter hours."
      >
        <Input
          id={`prj-approve-${reportId}`}
          type="number"
          name="hours"
          defaultValue={claimedHours}
          min={0.25}
          max={200}
          step={0.25}
          inputMode="decimal"
        />
      </Field>
      <Field
        label="Note to the author"
        htmlFor={`prj-note-${reportId}`}
        description="Required when you return the report."
      >
        <Textarea
          id={`prj-note-${reportId}`}
          name="note"
          maxLength={1000}
          rows={3}
        />
      </Field>
      <div className="prj-acts">
        <Button
          type="submit"
          name="intent"
          value="approve"
          size="sm"
          disabled={pending}
        >
          Approve
        </Button>
        <Button
          type="submit"
          name="intent"
          value="return"
          size="sm"
          variant="secondary"
          disabled={pending}
        >
          Return with note
        </Button>
      </div>
      {state.message && (
        <p className={cn("prj-status", state.ok ? "ok" : "bad")} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
