"use client";

import "./configEditor.css";

import { resetConfigEditAction } from "~/server/actions/configEdits";
import { Button } from "~/ui/button";
import { CommandFeedback, useCommand } from "~/ui/use-command";

/** Resets one saved edit that no longer fits the official config. A refusal shows beside the button. */
export default function OrphanReset({
  collection,
  editKey,
}: {
  collection: string;
  editKey: string;
}) {
  const { run, pending, result } = useCommand(resetConfigEditAction);
  return (
    <form action={() => run(collection, editKey)} className="cfg-inline">
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Reset
      </Button>
      <CommandFeedback result={result} />
    </form>
  );
}
