import type { ReactNode } from "react";
import type { DocsStatus } from "~/server/docs/docsStatus";
import { Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { buttonVariants } from "~/ui/button";
import { TextLink } from "~/ui/text-link";
import Link from "next/link";
import { DocsCommand } from "./DocsCommands";

const PUBLISHED = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
});

/** One line saying where the docs stand. Never says they are reachable by readers unless a version has published. */
export function DocsStatusLine({ status }: { status: DocsStatus }): ReactNode {
  switch (status.kind) {
    case "bundled":
      return (
        <p className="prj-head">
          <Badge>Bundled</Badge>
          <span className="prj-meta">
            This project&rsquo;s docs are part of the site&rsquo;s own docs.
          </span>
        </p>
      );
    case "off":
      return (
        <p className="prj-head">
          <Badge>Off</Badge>
          <span className="prj-meta">This project&rsquo;s docs are off.</span>
        </p>
      );
    case "proposal":
      return (
        <p className="prj-head">
          <Badge variant="info">Pull request open</Badge>
          <span className="prj-meta">
            A pull request to turn docs {status.enable ? "on" : "off"}{" "}
            {status.prUrl ? (
              <>
                is open:{" "}
                <TextLink href={status.prUrl} target="_blank" rel="noreferrer">
                  view the pull request
                </TextLink>
                . Docs change only after it is merged.
              </>
            ) : (
              "is being opened."
            )}
          </span>
        </p>
      );
    case "on":
      return (
        <p className="prj-head">
          <Badge variant="success">On</Badge>
          <span className="prj-meta">
            Docs are on. Each version publishes after a reviewer approves it,
            and none has yet.
          </span>
        </p>
      );
    case "paused":
      return (
        <p className="prj-head">
          <Badge variant="warning">Paused</Badge>
          <span className="prj-meta">
            Docs are paused because the repository changed owner. An officer
            must confirm the new owner before they publish again.
          </span>
        </p>
      );
    case "published":
      return (
        <p className="prj-head">
          <Badge variant="success">Published</Badge>
          <span className="prj-meta">
            Docs are on, first published {PUBLISHED.format(status.at)} Eastern.
          </span>
        </p>
      );
  }
}

/**
 * The project page's docs panel: where the docs stand, for anyone who can see
 * the project; the preview and the readiness check for the people who may read
 * the docs early (`preview`); and the officer's pull request buttons
 * (`officer`). The page decides who gets which: `preview` is null for everyone
 * else.
 */
export default function DocsPanel({
  projectId,
  status,
  preview,
  officer,
}: {
  projectId: string;
  status: DocsStatus;
  /**
   * For owners, contributors and docs reviewers: the preview's address, or null
   * when there is no repository to read; and the readiness check to stream in.
   */
  preview: { href: string | null; readiness: ReactNode } | null;
  officer: boolean;
}) {
  const inFlight = status.kind === "proposal";
  return (
    <Panel
      id="docs"
      title="Docs"
      help="Docs come from the docs/ folder on a repository's default branch. Turning them on opens a pull request that adds the project to the site's docs map; each version still needs a reviewer's approval to publish."
    >
      <DocsStatusLine status={status} />

      {preview && status.kind !== "bundled" && (
        <>
          {preview.href ? (
            <div className="prj-acts">
              <Link
                href={preview.href}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Open the docs preview
              </Link>
            </div>
          ) : (
            <p className="prj-meta">
              There is no repository to read docs from yet. Link an approved
              public one first.
            </p>
          )}
          {preview.readiness}
        </>
      )}

      {officer && status.kind !== "bundled" && (
        <div className="prj-acts">
          {(status.kind === "off" ||
            (inFlight && status.enable && status.prUrl === null)) && (
            <DocsCommand
              projectId={projectId}
              change="enable"
              label="Enable docs"
            />
          )}
          {(status.kind === "on" ||
            status.kind === "published" ||
            status.kind === "paused" ||
            (inFlight && !status.enable && status.prUrl === null)) && (
            <DocsCommand
              projectId={projectId}
              change="disable"
              label="Disable docs"
            />
          )}
          {status.kind === "paused" && (
            <DocsCommand
              projectId={projectId}
              change="confirm"
              label="Confirm new owner"
              variant="default"
            />
          )}
        </div>
      )}
    </Panel>
  );
}
