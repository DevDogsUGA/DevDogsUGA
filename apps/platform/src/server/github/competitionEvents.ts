import { eq } from "drizzle-orm";
import type { db } from "~/server/db";
import { competitions } from "~/server/db/schema";
import { ingestCompetitionItem } from "./competitions";

/**
 * The live half of the competitions mirror: two GitHub event types, wired
 * from `/github/webhook` after the signature is verified.
 *
 * `projects_v2_item` is where kickoff and every field refresh happen --
 * `converted` (a draft became this issue) and `edited` (a field value or the
 * item's content changed) both call `ingestCompetitionItem`, which re-fetches
 * the item over GraphQL. Unlike the team webhooks in `webhookEvents.ts`, that
 * fetch is unavoidable here: a `projects_v2_item` delivery carries only the
 * item's node id, never its field values or its content, so there is nothing
 * in the payload itself this module could apply.
 *
 * `issues` is narrower on purpose: `closed`, `reopened` and `edited`, and
 * ONLY for an issue this table already mirrors -- membership was already
 * proven the moment that row was created, through the `projects_v2_item`
 * path, and an `issues` payload carries no Project information at all to
 * re-prove it with. `edited` updates the brief (the issue body) and
 * deliberately leaves `title` alone: this table's title prefers the
 * Project's "Title" field over the issue's own, and an `issues` payload has
 * no way to say which one changed, so trusting it would risk silently
 * clobbering an officer's Project-field title with the issue's raw one.
 * `opened` is not handled: an issue "opens" the moment a draft converts,
 * which the `projects_v2_item.converted` delivery for the SAME event already
 * covers, matching this file's own kickoff path rather than a second one.
 */

export interface ProjectsV2ItemEventPayload {
  action: string;
  projects_v2_item: { node_id: string };
}

/**
 * `projects_v2_item`: a draft converted, or an item's field/content changed.
 *
 * Every other action (`created` -- draft added, not yet a competition;
 * `deleted`/`archived`/`restored`/`reordered`) is ignored -- see this file's
 * header, and `server/github/competitions.ts`'s header on why `deleted`/
 * `archived` leave an already-kicked-off row untouched rather than being
 * treated as a removal.
 */
export async function handleProjectsV2ItemEvent(
  database: typeof db,
  payload: ProjectsV2ItemEventPayload,
): Promise<void> {
  if (payload.action !== "converted" && payload.action !== "edited") return;
  await ingestCompetitionItem(payload.projects_v2_item.node_id, database);
}

export interface CompetitionIssueEventPayload {
  action: string;
  issue: {
    node_id: string;
    body: string | null;
    closed_at: string | null;
  };
}

/** `issues`: closed, reopened, or edited, for a mirrored competition only. */
export async function handleCompetitionIssueEvent(
  database: typeof db,
  payload: CompetitionIssueEventPayload,
): Promise<void> {
  if (
    payload.action !== "closed" &&
    payload.action !== "reopened" &&
    payload.action !== "edited"
  ) {
    return;
  }

  const [row] = await database
    .select({ id: competitions.id })
    .from(competitions)
    .where(eq(competitions.issueNodeId, payload.issue.node_id))
    .limit(1);
  // Not one of ours: either a plain repo issue that never went through the
  // Competitions Project, or one that has not been converted-and-ingested
  // yet. Either way, nothing here to update.
  if (!row) return;

  if (payload.action === "closed") {
    await database
      .update(competitions)
      .set({
        closedAt: payload.issue.closed_at
          ? new Date(payload.issue.closed_at)
          : new Date(),
        githubSyncedAt: new Date(),
      })
      .where(eq(competitions.id, row.id));
  } else if (payload.action === "reopened") {
    await database
      .update(competitions)
      .set({ closedAt: null, githubSyncedAt: new Date() })
      .where(eq(competitions.id, row.id));
  } else {
    await database
      .update(competitions)
      .set({ brief: payload.issue.body, githubSyncedAt: new Date() })
      .where(eq(competitions.id, row.id));
  }
}
