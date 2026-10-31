"use client";

import "./hackathons.css";

import Link from "next/link";
import { submitHackathonAction } from "~/server/actions/hackathons";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { CommandFeedback, useCommand } from "~/ui/use-command";

/**
 * A member submits a hackathon on another platform for an officer to approve:
 * its link, its name and, if they know them, its dates. A link that is already
 * on file is not an error. The result says so and, when this member can see
 * its entry, links to it.
 */
export function SubmitHackathonForm() {
  const { result, run, pending } = useCommand(submitHackathonAction);
  const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const exists =
    result?.ok && result.data?.status === "exists" ? result.data : null;
  return (
    <form action={run} className="hk-form">
      <Field
        label="Web address"
        htmlFor="hk-url"
        description="The hackathon's own page. Hackathons on Devpost are listed already."
        error={errors.url}
        required
      >
        <Input
          id="hk-url"
          name="url"
          inputMode="url"
          autoComplete="off"
          required
          maxLength={2048}
        />
      </Field>
      <Field label="Name" htmlFor="hk-name" error={errors.name} required>
        <Input id="hk-name" name="name" required maxLength={200} />
      </Field>
      <div className="hk-dates">
        <Field label="Starts" htmlFor="hk-starts" error={errors.startsOn}>
          <Input id="hk-starts" name="startsOn" type="date" />
        </Field>
        <Field label="Ends" htmlFor="hk-ends" error={errors.endsOn}>
          <Input id="hk-ends" name="endsOn" type="date" />
        </Field>
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Submit for review
        </Button>
      </div>
      <CommandFeedback result={result} />
      {exists && (
        <Callout tone="info">
          {exists.linkable ? (
            <Link href={`#hackathon-${exists.id}`}>See it in the list</Link>
          ) : (
            "It is waiting for an officer to review it."
          )}
        </Callout>
      )}
    </form>
  );
}
