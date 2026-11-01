"use client";

import "./projects.css";

import type { ActionResult } from "~/lib/actionResult";
import { Button } from "~/ui/button";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { CommandFeedback, useCommand } from "~/ui/use-command";
import { addRepoField, refreshOutcome } from "./commandText";
import { linkRepoAction } from "~/server/actions/projects";
import { refreshProjectCommitsAction } from "~/server/actions/projectCommits";

/**
 * One server action behind one button. Its failure stays beside the button and
 * its success is a toast. `confirm` asks first, for the actions that cannot be
 * taken back or that remove something.
 */
export function ProjectCommand<Args extends unknown[]>({
  action,
  args,
  label,
  variant = "secondary",
  confirm,
}: {
  action: (...args: Args) => Promise<ActionResult<unknown>>;
  args: Args;
  label: string;
  variant?: "default" | "secondary" | "destructive";
  confirm?: { title: string; description: string };
}) {
  const { run, pending, result } = useCommand(action);
  const button = (
    <Button
      type={confirm ? "submit" : "button"}
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={confirm ? undefined : () => run(...args)}
    >
      {label}
    </Button>
  );
  return (
    <span className="prj-command">
      {confirm ? (
        <ConfirmDestructiveAction
          title={confirm.title}
          description={confirm.description}
          submitLabel={label}
          action={() => run(...args)}
        >
          {button}
        </ConfirmDestructiveAction>
      ) : (
        button
      )}
      <CommandFeedback result={result} />
    </span>
  );
}

/** Refreshes one repo's commits, and says whether it finished or is still running. */
export function RefreshCommitsCommand({
  projectId,
  githubRepoId,
}: {
  projectId: string;
  githubRepoId: string;
}) {
  const { run, pending, result } = useCommand(refreshProjectCommitsAction, {
    refresh: false,
  });
  return (
    <span className="prj-command">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => run(projectId, githubRepoId)}
      >
        Refresh commits
      </Button>
      {result?.ok && (
        <span className="prj-status ok" role="status">
          {refreshOutcome(result.data)}
        </span>
      )}
      <CommandFeedback result={result} />
    </span>
  );
}

/** Link another repo; the control check's refusal appears under the box. */
export function LinkRepoForm({ projectId }: { projectId: string }) {
  const { run, pending, result } = useCommand(linkRepoAction);
  const error = addRepoField(result);
  return (
    <form action={run} className="prj-form">
      <input type="hidden" name="projectId" value={projectId} />
      <Field
        label="Link a repository"
        htmlFor="prj-link-repo"
        description="owner/name. A public repo of yours, or a DevDogsUGA repo you can write to, is approved at once; any other organization's waits for an officer."
        error={error}
      >
        <Input id="prj-link-repo" name="repo" required maxLength={300} />
      </Field>
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Link repository
        </Button>
      </div>
      {!error && <CommandFeedback result={result} />}
    </form>
  );
}
