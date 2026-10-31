"use client";

import "./projects.css";

import { reviewReportAction } from "~/server/actions/projects";
import { Button } from "~/ui/button";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";
import { CommandFeedback, useCommand } from "~/ui/use-command";

/**
 * Approve a report (confirming the hours or adjusting them) or return it with
 * a note. Both go through one Command; the button picks the intent.
 */
export default function ReviewForm({
  reportId,
  claimedHours,
}: {
  reportId: string;
  claimedHours: number;
}) {
  const { run, pending, result } = useCommand(reviewReportAction);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  return (
    <form action={run} className="prj-form">
      <input type="hidden" name="reportId" value={reportId} />
      <Field
        label="Hours to approve"
        htmlFor={`prj-approve-${reportId}`}
        description="Confirm the claim or adjust it. Quarter hours."
        error={errors.hours}
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
        error={errors.note}
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
      {Object.keys(errors).length === 0 && <CommandFeedback result={result} />}
    </form>
  );
}
