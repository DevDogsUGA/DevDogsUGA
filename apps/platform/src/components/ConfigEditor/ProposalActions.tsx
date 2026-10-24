"use client";

import "./configEditor.css";

import { useActionState } from "react";
import {
  openConfigPrAction,
  resetAllConfigEditsAction,
  type ConfigActionState,
} from "~/server/actions/configEdits";
import { cn } from "~/lib/cn";
import { Button } from "~/ui/button";

const initialState: ConfigActionState = { ok: false, message: "" };

/**
 * Open PR, and Reset all. Open PR is disabled while the proposal has no
 * changes, does not validate, or pull requests are not set up here; the server
 * checks all three again.
 */
export default function ProposalActions({
  canOpen,
  hasEdits,
}: {
  canOpen: boolean;
  hasEdits: boolean;
}) {
  const [opened, open, opening] = useActionState(
    async () => await openConfigPrAction(),
    initialState,
  );
  const [reset, resetAll, resetting] = useActionState(
    async () => await resetAllConfigEditsAction(),
    initialState,
  );
  return (
    <div className="cfg-stack">
      <div className="cfg-actions">
        <form action={open}>
          <Button type="submit" size="sm" disabled={!canOpen || opening}>
            Open PR
          </Button>
        </form>
        {hasEdits && (
          <form action={resetAll}>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={resetting}
            >
              Reset all to official
            </Button>
          </form>
        )}
      </div>
      {opened.message && (
        <div role="status">
          <p className={cn("cfg-status", opened.ok ? "ok" : "bad")}>
            {opened.message}{" "}
            {opened.url && (
              <a href={opened.url} target="_blank" rel="noreferrer">
                View the pull request
              </a>
            )}
          </p>
          {opened.errors && (
            <ul className="cfg-errors">
              {opened.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {reset.message && (
        <p className={cn("cfg-status", reset.ok ? "ok" : "bad")} role="status">
          {reset.message}
        </p>
      )}
    </div>
  );
}
