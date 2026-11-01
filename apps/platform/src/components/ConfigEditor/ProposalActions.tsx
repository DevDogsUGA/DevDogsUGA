"use client";

import "./configEditor.css";

import {
  openConfigPrAction,
  resetAllConfigEditsAction,
} from "~/server/actions/configEdits";
import { Button } from "~/ui/button";
import { CommandFeedback, useCommand } from "~/ui/use-command";

/**
 * Open PR, and Reset all. Open PR is disabled while the proposal has no
 * changes, does not validate, or pull requests are not set up here; the server
 * checks all three again. Both are Commands: success is a toast, and the link
 * to the pull request stays beside the buttons. When the config checks fail,
 * every failure is listed under the message.
 */
export default function ProposalActions({
  canOpen,
  hasEdits,
}: {
  canOpen: boolean;
  hasEdits: boolean;
}) {
  const open = useCommand(openConfigPrAction);
  const reset = useCommand(resetAllConfigEditsAction);
  const failures =
    open.result && !open.result.ok
      ? Object.values(open.result.fieldErrors ?? {})
      : [];
  return (
    <div className="cfg-stack">
      <div className="cfg-actions">
        <form action={() => open.run()}>
          <Button type="submit" size="sm" disabled={!canOpen || open.pending}>
            Open PR
          </Button>
        </form>
        {hasEdits && (
          <form action={() => reset.run()}>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={reset.pending}
            >
              Reset all to official
            </Button>
          </form>
        )}
      </div>
      {open.result?.ok && open.result.data?.url && (
        <p className="cfg-status ok">
          <a href={open.result.data.url} target="_blank" rel="noreferrer">
            View the pull request
          </a>
        </p>
      )}
      <CommandFeedback result={open.result} />
      {failures.length > 0 && (
        <ul className="cfg-errors">
          {failures.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <CommandFeedback result={reset.result} />
    </div>
  );
}
