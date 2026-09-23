import type { db } from "~/server/db";
import { applyPullRequest, type PullRequestFields } from "./pullRequest";

/**
 * The live half of the competition-entries mirror: one webhook event type,
 * wired from `/github/webhook` after the signature is verified.
 *
 * `pull_request` carries everything `applyPullRequest` needs -- title, body,
 * head/base refs, the merge/close timestamps -- so unlike the competitions
 * mirror's `projects_v2_item` handling, there is no GraphQL fetch here: the
 * payload IS the fact, the same reasoning `webhookEvents.ts`'s module doc
 * gives for the team mirror.
 *
 * Four actions matter -- `opened`, `edited`, `reopened`, `closed` -- and all
 * four route through the same `applyPullRequest`, because GitHub always
 * sends the PR's full CURRENT state on every delivery regardless of which
 * action fired it, not a diff. Re-applying the current state is what makes
 * this idempotent under redelivery, and it is what makes `closed` need no
 * branch of its own: a closed (or closed-by-merge) PR's `merged_at`/
 * `closed_at` are just two more fields of that same current state.
 * `edited` covers the one case that is NOT idempotent-by-construction --
 * removing an issue link, or retargeting the base off `main` -- and
 * `applyPullRequest` deletes the (not-yet-merged) entry when either happens.
 *
 * Every other action (`assigned`, `labeled`, `synchronize`, ...) is ignored.
 */
export interface PullRequestEventPayload {
  action: string;
  pull_request: {
    node_id: string;
    number: number;
    html_url: string;
    title: string;
    body: string | null;
    created_at: string;
    merged_at: string | null;
    closed_at: string | null;
    head: { ref: string };
    base: { ref: string };
  };
}

const HANDLED_ACTIONS = new Set(["opened", "edited", "reopened", "closed"]);

export async function handlePullRequestEvent(
  database: typeof db,
  payload: PullRequestEventPayload,
): Promise<void> {
  if (!HANDLED_ACTIONS.has(payload.action)) return;

  const pr = payload.pull_request;
  const fields: PullRequestFields = {
    nodeId: pr.node_id,
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
    body: pr.body,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    createdAt: pr.created_at,
    mergedAt: pr.merged_at,
    closedAt: pr.closed_at,
  };
  await applyPullRequest(database, fields);
}
