import "server-only";
import { env } from "~/env";
import { CONFIG_REPO } from "~/server/config/proposals";
import { githubClient } from "~/server/github/sync";
import { newBudget, type GithubClient } from "~/server/github/transport";
import { createDocsStore } from "./docsStore";
import {
  recordPublications,
  reconcileDocsProposals,
  type PullState,
  type ReconcileDeps,
  type ReconcileResult,
} from "./docsProposals";
import { getPublishedPointers } from "./published";
import { revalidateContributeMenu } from "./contribute";

/** GitHub's own words for a pull request, as `PullState`. */
function stateOf(pull: {
  state?: string;
  merged?: boolean;
  merged_at?: string | null;
}): PullState {
  if (pull.merged === true || pull.merged_at) return { kind: "merged" };
  return pull.state === "closed" ? { kind: "closed" } : { kind: "open" };
}

/**
 * The GitHub half of reconciliation, through the read-only App the commit sync
 * uses. The central repository is public, so its pull requests need no grant
 * beyond the installation token's metadata read, and the config writer App is
 * never asked to read.
 */
function reconcileDeps(client: GithubClient): ReconcileDeps {
  const budget = newBudget(15_000);
  const repoPath = `/repos/${env.GITHUB_ORG}/${CONFIG_REPO}`;
  return {
    store: createDocsStore(),
    now: Date.now,
    async pullState(number) {
      const result = await client.githubFetch<{
        state: string;
        merged: boolean;
      }>(`${repoPath}/pulls/${number}`, budget);
      return result.ok ? stateOf(result.data) : { kind: "unknown" };
    },
    async pullForBranch(branch) {
      const result = await client.githubFetch<
        {
          number: number;
          html_url: string;
          state: string;
          merged_at: string | null;
        }[]
      >(
        `${repoPath}/pulls?head=${encodeURIComponent(`${env.GITHUB_ORG}:${branch}`)}&state=all&per_page=1`,
        budget,
      );
      const pull = result.ok ? result.data[0] : undefined;
      return pull
        ? { number: pull.number, url: pull.html_url, state: stateOf(pull) }
        : null;
    },
  };
}

/**
 * Brings the project docs bookkeeping up to date with GitHub and the bucket:
 * follows each in-flight docs pull request to its end, and records the first
 * publication of projects whose docs have published. Run by the commit sync's
 * cron route after its own work, on every invocation, so a merge shows within
 * fifteen minutes. It costs one database read when nothing is in flight.
 *
 * Never throws: a failure here must not fail the commit sync or its heartbeat,
 * so it is logged (Sentry picks up the console error) and tried again next run.
 */
export async function runDocsReconcile(
  client: GithubClient = githubClient(),
): Promise<(ReconcileResult & { published: number }) | null> {
  try {
    const deps = reconcileDeps(client);
    const result = await reconcileDocsProposals(deps);
    const published = await recordPublications(
      deps.store,
      await getPublishedPointers(),
    );
    if (result.merged + result.closed + result.failed + published > 0) {
      revalidateContributeMenu();
    }
    return { ...result, published };
  } catch (error) {
    console.error("project_docs_reconcile_failed", error);
    return null;
  }
}
