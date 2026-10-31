/**
 * The on-demand "refresh my commits" server function (D0 section 5). The
 * action in `~/server/actions/projectCommits.ts` authorizes the session
 * first and passes the Caller in; this applies the record rule, the rate
 * limit and the per-repo lease.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import type { Caller } from "~/server/auth/access";
import { consumeRateLimit } from "~/server/rateLimit";
import { newBudget } from "./transport";
import { githubClient, syncRepo } from "./sync";

/** Refreshes per user and repo per hour. */
const REFRESHES_PER_HOUR = 3;
/**
 * A request is answered within the HTTP call, so it gets a smaller slice than
 * a cron invocation. A scan this does not finish keeps its pinned head and
 * page, and the fifteen-minute continuation resumes it.
 */
const REQUEST_BUDGET_MS = 20_000;

export type RefreshResult =
  | {
      ok: true;
      data: {
        /** `cached`: nothing more to do now, or another worker already has the repo. */
        status: "queued" | "cached";
        lastSyncedAt: string | null;
      };
    }
  | { ok: false; message: string };

/**
 * The record rule: the caller may refresh a repo linked to the Project if
 * they are an Owner (explicit, or an Officer on a DevDogs-owned Project), a
 * Contributor (one of their stored commits is on a repo the Project links),
 * or an Officer. Only an approved link counts; a pending or declined one
 * confers nothing.
 */
async function mayRefresh(caller: Caller, projectId: string, repoId: string) {
  const rows = await db.execute(sql`
    select 1 from platform."projectRepos" pr
    where pr."projectId" = ${projectId}::uuid and pr."githubRepoId" = ${repoId}::bigint
      and pr.approval = 'approved'
      and (
        ${caller.isLeader}::boolean
        or exists (
          select 1 from platform."projectOwners" o
          where o."projectId" = pr."projectId" and o."userId" = ${caller.userId}::uuid)
        or exists (
          select 1 from platform."repoCommits" rc
          join platform.commits c using (sha)
          join platform."projectRepos" linked on linked."githubRepoId" = rc."githubRepoId"
          where linked."projectId" = pr."projectId" and linked.approval = 'approved'
            and c."userId" = ${caller.userId}::uuid))`);
  return rows.length > 0;
}

/**
 * Starts a full default-branch scan of one of a Project's repos, sharing the
 * repo's lease with the sweep so the two never run at once, and answers with
 * whether it finished or was queued, and when the repo last synced.
 */
export async function requestCommitRefresh(
  caller: Caller,
  projectId: string,
  repoId: string,
): Promise<RefreshResult> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || !/^[1-9][0-9]{0,18}$/.test(repoId))
    return { ok: false, message: "Invalid project or repository." };
  if (!(await mayRefresh(caller, projectId, repoId)))
    return {
      ok: false,
      message: "Only project owners, contributors or officers can refresh.",
    };
  // Checked before the upstream work it guards, and after the cheap denial above.
  const allowed = await consumeRateLimit({
    scope: `project-commits:${repoId}`,
    subjectId: caller.userId,
    limit: REFRESHES_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!allowed) return { ok: false, message: "Try again later." };
  const result = await syncRepo(
    repoId,
    githubClient(),
    newBudget(REQUEST_BUDGET_MS),
    true,
  );
  if (!result.ok && result.kind === "auth")
    return { ok: false, message: result.message };
  const [state] = await db.execute<{ lastSucceededAt: Date | null }>(
    sql`select "lastSucceededAt" from platform."repoSyncState" where "githubRepoId" = ${repoId}::bigint`,
  );
  return {
    ok: true,
    data: {
      status: result.ok && result.data === "queued" ? "queued" : "cached",
      lastSyncedAt: state?.lastSucceededAt
        ? new Date(state.lastSucceededAt).toISOString()
        : null,
    },
  };
}
