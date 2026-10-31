"use client";

import "./hackathons.css";

import { decideHackathonAction } from "~/server/actions/hackathons";
import { Button } from "~/ui/button";
import { CommandFeedback, useCommand } from "~/ui/use-command";

/** An officer approves or declines one submission waiting for review. */
export function HackathonDecision({ id }: { id: string }) {
  const { result, run, pending } = useCommand(decideHackathonAction);
  return (
    <div>
      <div className="hk-actions">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(id, "approved")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => run(id, "declined")}
        >
          Decline
        </Button>
      </div>
      <CommandFeedback result={result} />
    </div>
  );
}
