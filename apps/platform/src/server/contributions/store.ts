import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import type { MergedPullRequest } from "./pullRequest";

/**
 * Records a merged pull request, once.
 *
 * Idempotent on both keys: the delivery id (GitHub redelivers the same
 * delivery) and `(repo, PR number)` (the backfill, or a second delivery for
 * the same merge). `on conflict do nothing` with no target covers both unique
 * constraints, so a duplicate is a quiet no-op and never an error.
 *
 * The member is matched here by GitHub user id against the linked GitHub
 * identity (`auth.identities.provider_id`), never by login. No match leaves
 * `userId` null; `platform.claim_contributions` fills it when the author
 * links GitHub later.
 */
export async function recordContribution(
  pr: MergedPullRequest,
  deliveryId: string | null,
): Promise<"recorded" | "duplicate"> {
  const rows = await db.execute(sql`
    insert into platform.contributions (
      "repo", "repoPrivate", "prNumber", "title", "url", "mergedAt",
      "authorGithubId", "authorLogin", "userId", "deliveryId"
    )
    values (
      ${pr.repo}, ${pr.repoPrivate}, ${pr.number}, ${pr.title}, ${pr.url},
      ${pr.mergedAt.toISOString()}::timestamptz,
      ${pr.authorGithubId}, ${pr.authorLogin},
      (select i.user_id from auth.identities i
        where i.provider = 'github' and i.provider_id = ${pr.authorGithubId}),
      ${deliveryId}
    )
    on conflict do nothing
    returning id
  `);
  return rows.length > 0 ? "recorded" : "duplicate";
}
