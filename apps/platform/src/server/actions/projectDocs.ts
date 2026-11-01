"use server";

import { z } from "zod";
import { expected, failure, type ActionResult } from "~/lib/actionResult";
import { authorize, rules, type Caller } from "~/server/auth/access";
import { docsDeps } from "~/server/docs/docsDeps";
import {
  proposeDocsChange,
  type DocsChange,
} from "~/server/docs/docsProposals";

/**
 * The officer's docs actions. Each opens a pull request that changes the
 * central docs map (`.github/docs-projects.json`) and returns its address. They
 * never say docs are live: the map only changes when the pull request is
 * merged, publishing then waits for the docs-publishing environment's approval,
 * and `docsRequested` follows the map once the commit sync's route sees the
 * merge (`docsReconcile.ts`). The rules, the retry behaviour and the audit event
 * are in `server/docs/docsProposals.ts`; this authorizes and words the answer.
 */

/** The pull request an action opened (or found already open). */
export interface DocsPullRequest {
  url: string;
  /** True when this call changed nothing because the map already agrees. */
  unchanged: boolean;
}

async function open(
  caller: Caller,
  projectId: string,
  change: DocsChange,
): Promise<ActionResult<DocsPullRequest>> {
  if (!z.string().uuid().safeParse(projectId).success)
    return failure("That project was not found.");

  const result = await expected(() =>
    proposeDocsChange(docsDeps(), caller, projectId, change),
  );
  if (!result.ok) return result;

  const outcome = result.data!;
  if (outcome.kind === "unchanged")
    return { ok: true, message: outcome.message };
  const done =
    change === "enable"
      ? "to turn docs on"
      : change === "disable"
        ? "to turn docs off"
        : "to confirm the new owner";
  return {
    ok: true,
    data: { url: outcome.url, unchanged: false },
    message: outcome.recovered
      ? `A pull request ${done} is already open: ${outcome.url}`
      : `Opened a pull request ${done}: ${outcome.url}. Docs change only after it is merged.`,
  };
}

/**
 * Turns a project's docs on or off by opening the pull request that adds or
 * removes its entry in the map. The project needs an approved, available
 * repository (its docs repository, or its only one) and a slug of its own.
 */
export async function setProjectDocs(
  projectId: string,
  enable: boolean,
): Promise<ActionResult<DocsPullRequest>> {
  const access = await authorize(rules.officer);
  if (!access.ok) return access;
  return open(access.caller, projectId, enable ? "enable" : "disable");
}

/**
 * After a project's repository changed owner (which pauses its docs), an
 * officer confirms the new owner: opens the pull request that updates the
 * map's confirmed owner. Publishing resumes once it is merged.
 */
export async function confirmDocsOwner(
  projectId: string,
): Promise<ActionResult<DocsPullRequest>> {
  const access = await authorize(rules.officer);
  if (!access.ok) return access;
  return open(access.caller, projectId, "confirm");
}
