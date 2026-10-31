"use client";

import "./projects.css";

import { confirmDocsOwner, setProjectDocs } from "~/server/actions/projectDocs";
import { Button } from "~/ui/button";
import { TextLink } from "~/ui/text-link";
import { CommandFeedback, useCommand } from "~/ui/use-command";

/** What an officer's docs button asks for. */
export type DocsCommandChange = "enable" | "disable" | "confirm";

/** The actions, as one-argument functions so each Command holds a stable one. */
const ACTIONS = {
  enable: (projectId: string) => setProjectDocs(projectId, true),
  disable: (projectId: string) => setProjectDocs(projectId, false),
  confirm: (projectId: string) => confirmDocsOwner(projectId),
} as const;

/**
 * One officer docs action behind one button. Each opens a pull request that
 * changes the central docs map, and nothing more: success shows the pull
 * request's address and says the docs change only once it is merged, never
 * that they are on or published. An answer with no pull request (the map
 * already said it) shows its own words; a refusal stays beside the button.
 */
export function DocsCommand({
  projectId,
  change,
  label,
  variant = "secondary",
}: {
  projectId: string;
  change: DocsCommandChange;
  label: string;
  variant?: "default" | "secondary";
}) {
  const { run, pending, result } = useCommand(ACTIONS[change]);
  const url = result?.ok ? result.data?.url : undefined;
  return (
    <span className="prj-command">
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() => run(projectId)}
      >
        {label}
      </Button>
      {result?.ok && (
        <span className="prj-status ok" role="status">
          {url ? (
            <>
              Pull request opened:{" "}
              <TextLink href={url} target="_blank" rel="noreferrer">
                {url}
              </TextLink>
              . Docs change only after it is merged.
            </>
          ) : (
            result.message
          )}
        </span>
      )}
      <CommandFeedback result={result} />
    </span>
  );
}
