"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import { CommandFeedback, useCommand } from "~/ui/use-command";
import { updateIdentity } from "~/server/actions/profile";

interface Props {
  involvementFullName: string;
}

/** Sets the preferred name to the Involvement Network name; a refusal shows beside the button. */
export default function SyncPreferredNameButton({
  involvementFullName,
}: Props) {
  const { run, pending, result } = useCommand(updateIdentity);

  return (
    <span className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => run({ preferredName: involvementFullName.trim() })}
        disabled={pending}
        loading={pending}
      >
        <ArrowCounterClockwiseIcon aria-hidden />
        {`Update Name to "${involvementFullName}"`}
      </Button>
      <CommandFeedback result={result} />
    </span>
  );
}
