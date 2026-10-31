/**
 * The commit sync: default-branch commits by DevDogs members, from the public
 * DevDogsUGA repos and every approved linked repo (D0 sections 4 and 5, and
 * section 8.7 and 8.8 as they override them).
 *
 * One invocation spends at most 100 GitHub requests or 45 seconds, and
 * persists where it stopped so the next resumes: the daily cron starts a
 * cycle and the fifteen-minute dispatcher continues it, or picks up a
 * member's backfill, without restarting anything. Leases and cursors live in
 * `repoSyncState`, `projectSyncJobs` and `commitBackfillRequests`, and every
 * completion is fenced by its lease token (`./store`).
 *
 * A cycle runs these phases in order: org inventory, a per-repo sweep, the
 * members' backfills. Size hydration runs after, with its own share of the
 * budget, so neither a stalled backfill nor a failing repo starves it.
 */
import "server-only";
import { env } from "~/env";
import {
  GithubClient,
  hasRoom,
  newBudget,
  type Budget,
  type GithubResult,
} from "./transport";
import { inventoryPage, publicRepo, repoPath, type Repo } from "./repos";
import {
  checkpoint,
  claimBackfill,
  claimJob,
  claimRepo,
  completeBackfill,
  failBackfill,
  interruptedRepoIds,
  markUnavailable,
  pendingStats,
  releaseBackfill,
  releaseJob,
  releaseRepo,
  saveBackfillPage,
  saveCommitPage,
  saveRepo,
  saveStats,
  scopeRepos,
  type BackfillCursor,
  type BackfillRequest,
  type Commit,
  type Cursor,
} from "./store";
import { db } from "~/server/db";
import { sql } from "drizzle-orm";

const WEEK_MS = 7 * 86_400_000;
/** Repos taken from the scope query per cursor step. */
const SCOPE_PAGE = 100;
const STATS_PER_RUN = 20;
/** GitHub caps a commit's file list at 3,000 entries: thirty pages of 100. */
const MAX_FILE_PAGES = 30;

let client: GithubClient | undefined;
/** Only the read App enters the source transport; the config writer is never consulted. */
export function githubClient() {
  return (client ??= new GithubClient({
    appId: env.GH_APP_ID ?? "",
    privateKey: env.GH_APP_PRIVATE_KEY ?? "",
  }));
}

type Failure = Extract<GithubResult<never>, { ok: false }>;

/**
 * Refreshes a repo's cache by numeric id. A repo that is now private counts as
 * unavailable, as does a 404; an auth, rate or transient failure leaves health
 * alone. The by-id route is not documented for private or installation access,
 * so a 404 retries the cached owner/name, and only an answer carrying the same
 * id is believed: a reused name never attaches to the old identity.
 */
export async function refreshRepo(
  id: string,
  api: GithubClient,
  budget: Budget,
): Promise<GithubResult<Repo>> {
  let result = publicRepo(
    await api.githubFetch<Repo>(`/repositories/${id}`, budget),
  );
  if (!result.ok && result.kind === "unavailable") {
    const cached = await db.execute<{ owner: string; name: string }>(
      sql`select owner, name from platform."githubRepos" where "githubRepoId"=${id}::bigint`,
    );
    if (cached[0]) {
      const fallback = publicRepo(
        await api.githubFetch<Repo>(
          `/repos/${encodeURIComponent(cached[0].owner)}/${encodeURIComponent(cached[0].name)}`,
          budget,
        ),
      );
      if (fallback.ok && String(fallback.data.id) === id) result = fallback;
      else if (!fallback.ok && fallback.kind !== "unavailable")
        result = fallback;
    }
  }
  if (result.ok && String(result.data.id) !== id)
    return {
      ok: false,
      kind: "retry",
      message: "Repository identity mismatch",
      retryAt: new Date(Date.now() + 60_000),
    };
  if (result.ok) await saveRepo(result.data);
  else if (result.kind === "unavailable") await markUnavailable(id);
  return result;
}

/**
 * Scans one repo's default branch under its lease: `complete` when the scan
 * finished and success was recorded, `queued` when the budget ended first (the
 * pinned head and page are saved to resume), `cached` when another worker holds
 * the repo.
 *
 * The scan lists a pinned head, so paging is stable while commits land. It is
 * incremental (since the last success minus seven days) except on the first
 * scan, after a default-branch change, on a requested full scan, and weekly,
 * when it walks the whole history: `since` alone misses an old-dated commit
 * merged today and anything a force-push rewrote. Success never advances
 * until every page's commits and provenance are stored; size hydration runs
 * separately and cannot hold this up.
 */
export async function syncRepo(
  id: string,
  api: GithubClient,
  budget: Budget,
  fullRequested = false,
): Promise<GithubResult<"complete" | "queued" | "cached">> {
  const scan = await claimRepo(id);
  if (!scan) return { ok: true, data: "cached", next: false };
  const done = (data: "complete" | "queued") =>
    ({ ok: true, data, next: false }) as const;
  try {
    const metadata = await refreshRepo(id, api, budget);
    if (!metadata.ok) {
      await releaseRepo(
        id,
        scan.leaseToken,
        false,
        metadata.message,
        metadata.retryAt,
      );
      return metadata;
    }
    const repo = metadata.data;
    if (!repo.default_branch) {
      await releaseRepo(id, scan.leaseToken, true);
      return done("complete");
    }
    // `saveRepo` resets the scan on a branch change; read it back under our lease.
    const [current] = await db.execute<typeof scan>(
      sql`select *, "githubRepoId"::text from platform."repoSyncState" where "githubRepoId"=${id}::bigint and "leaseToken"=${scan.leaseToken}::uuid`,
    );
    if (!current) return done("queued");
    let head = current.scanHeadSha;
    const full =
      current.mode === "full" ||
      fullRequested ||
      !current.lastSucceededAt ||
      !current.lastFullScanAt ||
      new Date(current.lastFullScanAt).getTime() < Date.now() - WEEK_MS;
    const since = head
      ? current.scanSince
      : full
        ? null
        : new Date(new Date(current.lastSucceededAt!).getTime() - WEEK_MS);
    if (!head) {
      const tip = await api.githubFetch<Commit[]>(
        `${repoPath(repo)}/commits?sha=${encodeURIComponent(repo.default_branch)}&per_page=1`,
        budget,
      );
      if (!tip.ok) {
        // 409 is an empty repo: available, with nothing to list.
        await releaseRepo(
          id,
          scan.leaseToken,
          tip.kind === "empty",
          tip.kind === "empty" ? null : tip.message,
          tip.retryAt,
        );
        return tip.kind === "empty" ? done("complete") : tip;
      }
      head = tip.data[0]?.sha ?? null;
      if (!head) {
        const finished = await releaseRepo(id, scan.leaseToken, true);
        return done(finished ? "complete" : "queued");
      }
      await checkpoint(id, scan.leaseToken, head, since, full);
    }
    let page = current.scanPage;
    while (hasRoom(budget)) {
      const result = await api.githubFetch<Commit[]>(
        `${repoPath(repo)}/commits?sha=${head}&per_page=100&page=${page}${since ? `&since=${encodeURIComponent(new Date(since).toISOString())}` : ""}`,
        budget,
      );
      if (!result.ok) {
        // 422: the pinned head or branch is stale. Rescan from a fresh head.
        if (result.kind === "branch")
          await db.execute(
            sql`update platform."repoSyncState" set "scanHeadSha"=null, "scanPage"=1, mode='full', "lastFullScanAt"=null where "githubRepoId"=${id}::bigint and "leaseToken"=${scan.leaseToken}::uuid`,
          );
        if (result.kind === "unavailable") await markUnavailable(id);
        await releaseRepo(
          id,
          scan.leaseToken,
          result.kind === "empty",
          result.message,
          result.retryAt,
        );
        return result;
      }
      const stored = await saveCommitPage(
        id,
        scan.leaseToken,
        repo.default_branch,
        result.data,
        page + 1,
      );
      if (!stored) return done("queued");
      if (!result.next) {
        const finished = await releaseRepo(id, scan.leaseToken, true);
        return done(finished ? "complete" : "queued");
      }
      page++;
    }
    await releaseRepo(id, scan.leaseToken, false);
    return done("queued");
  } catch (error) {
    await releaseRepo(id, scan.leaseToken, false, "Repository storage failed");
    throw error;
  }
}

type Detail = {
  stats: { additions: number; deletions: number };
  files?: { filename: string }[];
};

/**
 * Fetches size for commits still pending, once per SHA from any available repo
 * that has it. This is independent of listing: a failure leaves the commit
 * pending for the next run, a 404 settles it as unavailable, and nothing here
 * touches a repo checkpoint. Files are counted as unique names over the paged
 * detail (never by summing the repeated per-page stats); at GitHub's
 * 3,000-file cap the commit is `truncated` and its file count left unset.
 */
export async function hydrateStats(api: GithubClient, budget: Budget) {
  for (const c of await pendingStats(STATS_PER_RUN)) {
    const files = new Set<string>();
    let stats: Detail["stats"] | undefined;
    let outcome: "complete" | "truncated" | "unavailable" | undefined;
    for (let page = 1; page <= MAX_FILE_PAGES; page++) {
      const result = await api.githubFetch<Detail>(
        `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.name)}/commits/${c.sha}?per_page=100&page=${page}`,
        budget,
      );
      if (!result.ok) {
        // These end the run; anything else leaves this commit for next time.
        if (["auth", "rate", "budget"].includes(result.kind)) return result;
        if (result.kind === "unavailable" && page === 1)
          outcome = "unavailable";
        break;
      }
      stats ??= result.data.stats;
      for (const file of result.data.files ?? []) files.add(file.filename);
      if (!result.next) {
        outcome = "complete";
        break;
      }
      if (page === MAX_FILE_PAGES) outcome = "truncated";
    }
    if (outcome === "unavailable") await saveStats(c.sha, { state: outcome });
    else if (outcome && stats)
      await saveStats(c.sha, {
        state: outcome,
        files: outcome === "complete" ? files.size : null,
        additions: stats.additions,
        deletions: stats.deletions,
      });
  }
  return { ok: true as const };
}

/**
 * Walks one member's commits on every in-scope repo's default branch, full
 * history, `?author=<login>`. The login is resolved fresh from the numeric
 * GitHub id (`GET /user/{id}`), because the stored one may be stale; every
 * commit still goes through `shouldStoreCommit`, so a reused login cannot
 * attach someone else's commits. Progress is kept in the job cursor, so the
 * walk resumes across invocations; repos that went private or were deleted
 * are skipped, and a repo with no default branch has nothing to walk.
 */
async function backfillMember(
  request: BackfillRequest,
  resume: BackfillCursor | undefined,
  api: GithubClient,
  budget: Budget,
): Promise<
  | { done: true; cursor?: undefined }
  | { done: false; cursor: BackfillCursor; failure?: Failure }
> {
  let progress: BackfillCursor =
    resume?.user === request.userId && resume.githubId === request.githubId
      ? resume
      : { user: request.userId, githubId: request.githubId, after: "0" };
  const user = await api.githubFetch<{ id: number; login: string }>(
    `/user/${request.githubId}`,
    budget,
  );
  if (!user.ok) {
    if (user.kind === "unavailable") return { done: true };
    return { done: false, cursor: progress, failure: user };
  }
  if (String(user.data.id) !== request.githubId) return { done: true };
  for (;;) {
    const repos = await scopeRepos(progress.after, SCOPE_PAGE);
    if (repos.length === 0) return { done: true };
    for (const repo of repos) {
      if (!hasRoom(budget)) return { done: false, cursor: progress };
      let page = progress.repo === repo.id ? (progress.page ?? 1) : 1;
      let more = !!repo.defaultBranch;
      while (more) {
        if (!hasRoom(budget))
          return { done: false, cursor: { ...progress, repo: repo.id, page } };
        const result = await api.githubFetch<Commit[]>(
          `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/commits?sha=${encodeURIComponent(repo.defaultBranch!)}&author=${encodeURIComponent(user.data.login)}&per_page=100&page=${page}`,
          budget,
        );
        if (!result.ok) {
          if (result.kind === "unavailable") await markUnavailable(repo.id);
          // Skip a repo that is gone or empty, or whose branch is stale (the
          // sweep refreshes it); stop on anything that could affect all.
          if (["unavailable", "empty", "branch"].includes(result.kind)) break;
          return {
            done: false,
            cursor: { ...progress, repo: repo.id, page },
            failure: result,
          };
        }
        if (
          !(await saveBackfillPage(
            request,
            repo.id,
            repo.defaultBranch!,
            result.data,
          ))
        )
          return { done: false, cursor: progress };
        more = result.next;
        page++;
      }
      progress = {
        user: progress.user,
        githubId: progress.githubId,
        after: repo.id,
      };
    }
  }
}

/**
 * Drains due backfill requests under the invocation budget, one member at a
 * time, oldest first. Returns whether none remain due and the cursor to
 * resume. A rate, auth or budget stop gives the lease back with no penalty; a
 * transient failure counts an attempt and backs that request off while the
 * rest carry on.
 */
async function drainBackfills(
  cursor: Cursor,
  api: GithubClient,
  budget: Budget,
): Promise<{ cursor: Cursor; drained: boolean; failure?: Failure }> {
  let resume = cursor.backfill;
  while (hasRoom(budget)) {
    const request = await claimBackfill();
    if (!request)
      return { cursor: { ...cursor, backfill: undefined }, drained: true };
    try {
      const result = await backfillMember(request, resume, api, budget);
      if (result.done) {
        if (!(await completeBackfill(request))) await releaseBackfill(request);
        resume = undefined;
        continue;
      }
      if (
        result.failure &&
        !["auth", "rate", "budget"].includes(result.failure.kind)
      ) {
        await failBackfill(request, result.failure.message);
        resume = undefined;
        continue;
      }
      await releaseBackfill(request);
      return {
        cursor: { ...cursor, backfill: result.cursor },
        drained: false,
        failure: result.failure?.kind === "budget" ? undefined : result.failure,
      };
    } catch (error) {
      await failBackfill(request, "Backfill storage failed");
      throw error;
    }
  }
  return { cursor: { ...cursor, backfill: resume }, drained: false };
}

/**
 * One invocation of the commit sync. The daily cron starts a cycle
 * (`start`); the fifteen-minute continuation resumes one, or drains a member's
 * backfill when no cycle is running. The cycle's completion, fenced by its
 * lease, is what records the `platform-commit-sync` heartbeat, and only when
 * no repo failed transiently along the way.
 *
 * Failure handling follows D0 section 4: an auth failure fails the run and
 * alerts without marking any repo unavailable; a rate limit or an exhausted
 * budget defers to the reset; a repo that is unavailable counts as processed;
 * a transient failure on one repo skips it for this cycle and withholds the
 * heartbeat instead of blocking the rest.
 */
export async function runCommitSync(start: boolean, api = githubClient()) {
  const budget = newBudget();
  const job = await claimJob(start);
  let cursor: Cursor = job?.cursor ?? {};
  let complete = false;
  let failure: Failure | undefined;
  try {
    if (job) {
      if (cursor.phase === "inventory") {
        while (hasRoom(budget)) {
          const page = cursor.inventory ?? 1;
          const result = await inventoryPage(api, budget, page);
          if (!result.ok) {
            failure = result;
            break;
          }
          for (const repo of result.data) await saveRepo(repo);
          cursor = result.next
            ? { ...cursor, inventory: page + 1 }
            : { ...cursor, phase: "repos", inventory: undefined };
          if (!result.next) break;
        }
      }
      while (!failure && cursor.phase === "repos" && hasRoom(budget)) {
        let finished = true;
        const repos = await scopeRepos(cursor.after ?? "0", SCOPE_PAGE);
        for (const repo of repos) {
          if (!hasRoom(budget)) {
            finished = false;
            break;
          }
          const result = await syncRepo(repo.id, api, budget);
          if (result.ok && result.data === "queued") {
            finished = false;
            break;
          }
          if (!result.ok && ["auth", "rate", "budget"].includes(result.kind)) {
            if (result.kind !== "budget") failure = result;
            finished = false;
            break;
          }
          // Unavailable is an expected outcome and counts as processed; a
          // transient failure skips the repo and withholds this cycle's heartbeat.
          if (!result.ok && result.kind !== "unavailable")
            cursor = { ...cursor, dirty: true };
          cursor = { ...cursor, after: repo.id };
        }
        if (!finished) break;
        // A full page means more repos above the cursor: take the next page.
        if (repos.length < SCOPE_PAGE)
          cursor = { ...cursor, phase: "backfill", after: undefined };
      }
      if (!failure && cursor.phase === "backfill") {
        const result = await drainBackfills(cursor, api, budget);
        cursor = result.cursor;
        failure = result.failure;
        complete = result.drained && !failure;
      }
      await releaseJob(
        job.leaseToken,
        cursor,
        complete,
        !!cursor.sweep && !cursor.dirty,
        failure?.message ??
          (complete && cursor.dirty
            ? "A repository failed transiently this cycle"
            : null),
        failure?.retryAt,
      );
    }
    // Interrupted scans resume, then sizes hydrate, with whatever budget is left.
    for (const id of await interruptedRepoIds(3)) {
      if (!hasRoom(budget)) break;
      const result = await syncRepo(id, api, budget);
      if (!result.ok && result.kind === "auth") failure ??= result;
    }
    const hydration = await hydrateStats(api, budget);
    if (!hydration.ok && hydration.kind === "auth") failure ??= hydration;
    if (failure?.kind === "auth")
      console.error("project_commit_sync_auth_failed", {
        message: failure.message,
      });
    return {
      // Only an auth failure alerts; rate limits and transient failures retry.
      success: failure?.kind !== "auth",
      complete,
      requests: budget.requests,
      failure: failure?.kind,
    };
  } catch (error) {
    if (job)
      await releaseJob(
        job.leaseToken,
        cursor,
        false,
        false,
        "Commit sync storage failed",
      );
    throw error;
  }
}
