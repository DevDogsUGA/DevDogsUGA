/**
 * The commit sync's database writes. Everything that must be atomic or fenced
 * lives here, so the sync logic above it can be tested with these mocked and
 * these can be tested against a real database (`store.db-test.ts`).
 *
 * Three rules hold throughout:
 *
 * - A write that continues earlier work carries the lease token it was
 *   claimed with and fails, returning `false`, when the lease is no longer
 *   held, so a worker whose lease expired cannot overwrite a newer worker's
 *   progress or complete its scan.
 * - Commit identity is written once. `commits` rows are inserted with
 *   `on conflict do nothing`, so an existing row's author, message and first
 *   repository are never overwritten, and `repoCommits` provenance only grows.
 * - Nothing here deletes a repo, a commit or a provenance row.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { isDevdogs, type Repo } from "./repos";
import { shouldStoreCommit } from "./policy";

export type Commit = {
  sha: string;
  author: { id: number; login: string } | null;
  commit: { committer: { date: string }; message: string };
};
export type Scan = {
  githubRepoId: string;
  leaseToken: string;
  lastSucceededAt: Date | null;
  lastFullScanAt: Date | null;
  scanHeadSha: string | null;
  scanPage: number;
  scanSince: Date | null;
  mode: "full" | "incremental";
};
/**
 * Where a sweep or backfill stopped, held in `projectSyncJobs.cursor`. It
 * carries repo and member ids only, never names or content.
 */
export type Cursor = {
  phase?: "inventory" | "repos" | "backfill";
  /** Part of the daily cycle. Only a completed, clean sweep writes the heartbeat. */
  sweep?: true;
  /** A repo failed transiently this cycle, so finishing it is not a success. */
  dirty?: true;
  inventory?: number;
  /** The last repo id the sweep finished; the next one is the first above it. */
  after?: string;
  backfill?: BackfillCursor;
};
export type BackfillCursor = {
  user: string;
  githubId: string;
  /** The last repo id fully walked for this member. */
  after: string;
  repo?: string;
  page?: number;
};
export type Job = { leaseToken: string; cursor: Cursor };
export type BackfillRequest = {
  userId: string;
  githubId: string;
  requestedAt: string;
  leaseToken: string;
};
export type ScopeRepo = {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string | null;
};
type Database = typeof db;

/** A member's backfill gives up after this many failed attempts. */
const MAX_BACKFILL_ATTEMPTS = 8;
const LEASE = sql`interval '2 minutes'`;

/**
 * Upserts a public repo's cached metadata by numeric id, which is the only
 * identity: an old owner/name may be reused by another repo. A repo that has
 * come back is marked available again.
 *
 * An owner id OR login change pauses docs on that repo's Projects and clears
 * their confirmation, so an officer must confirm the new owner (D0 section 6);
 * a rename alone does not. A default-branch change restarts the repo's scan
 * as a full one.
 */
export async function saveRepo(repo: Repo, database: Database = db) {
  await database.transaction(async (tx) => {
    const id = String(repo.id);
    const old = await tx.execute<{
      ownerId: string;
      owner: string;
      defaultBranch: string | null;
    }>(
      sql`select "ownerId"::text, owner, "defaultBranch" from platform."githubRepos" where "githubRepoId"=${id}::bigint for update`,
    );
    await tx.execute(sql`
      insert into platform."githubRepos"
        ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch", "isDevdogsOrg", "lastCheckedAt", "lastAvailableAt")
      values (${id}::bigint, ${String(repo.owner.id)}::bigint, ${repo.owner.login}, ${repo.name}, ${repo.owner.type}, ${repo.default_branch}, ${isDevdogs(repo)}, now(), now())
      on conflict ("githubRepoId") do update set
        "ownerId"=excluded."ownerId", owner=excluded.owner, name=excluded.name,
        "ownerType"=excluded."ownerType", "defaultBranch"=excluded."defaultBranch",
        "isDevdogsOrg"=excluded."isDevdogsOrg", health='available',
        "unavailableSince"=null, "lastError"=null, "lastCheckedAt"=now(),
        "lastAvailableAt"=now(), "updatedAt"=now()`);
    const previous = old[0];
    if (!previous) return;
    if (
      previous.ownerId !== String(repo.owner.id) ||
      previous.owner !== repo.owner.login
    ) {
      await tx.execute(sql`
        update platform.projects set
          "docsPausedAt"=coalesce("docsPausedAt", now()),
          "docsPauseReason"=coalesce("docsPauseReason", 'Repository ownership changed; officer confirmation required'),
          "docsConfirmedOwnerId"=null, "docsConfirmedBy"=null, "docsConfirmedAt"=null,
          "updatedAt"=now()
        where "docsRepoId"=${id}::bigint`);
    }
    if (previous.defaultBranch !== repo.default_branch) {
      await tx.execute(sql`
        update platform."repoSyncState" set "scanHeadSha"=null, "scanPage"=1,
          "scanSince"=null, mode='full', "lastFullScanAt"=null
        where "githubRepoId"=${id}::bigint`);
    }
  });
}

/**
 * Marks a repo unavailable: it went private, was deleted or is blocked, which
 * GitHub does not distinguish. Only health changes; the registry row, its
 * synced commits and every project link stay (Q54).
 */
export async function markUnavailable(id: string, database: Database = db) {
  await database.execute(sql`
    update platform."githubRepos" set health='unavailable',
      "unavailableSince"=coalesce("unavailableSince", now()), "lastCheckedAt"=now(),
      "lastError"='Repository unavailable', "updatedAt"=now()
    where "githubRepoId"=${id}::bigint`);
}

/**
 * The repos the sweep covers: the public DevDogsUGA repos and every repo with
 * an approved project link, in id order after `after`. Linked repos outside
 * the org count only once an officer has approved the link.
 */
export async function scopeRepos(
  after: string,
  limit: number,
  database: Database = db,
): Promise<ScopeRepo[]> {
  return database.execute<ScopeRepo>(sql`
    select r."githubRepoId"::text as id, r.owner, r.name, r."defaultBranch"
    from platform."githubRepos" r
    where r."githubRepoId" > ${after}::bigint
      and (r."isDevdogsOrg" or exists (
        select 1 from platform."projectRepos" pr
        where pr."githubRepoId" = r."githubRepoId" and pr.approval = 'approved'))
    order by r."githubRepoId" limit ${limit}`);
}

/** Repos with a pinned, unfinished scan nobody holds, for continuation runs. */
export async function interruptedRepoIds(
  limit: number,
  database: Database = db,
): Promise<string[]> {
  const rows = await database.execute<{ id: string }>(sql`
    select s."githubRepoId"::text as id from platform."repoSyncState" s
    where s."scanHeadSha" is not null
      and (s."leaseUntil" is null or s."leaseUntil" <= now())
      and (s."nextAttemptAt" is null or s."nextAttemptAt" <= now())
    order by s."nextAttemptAt" nulls first limit ${limit}`);
  return rows.map((row) => row.id);
}

/**
 * Stores the members' commits in a page and records each as reachable from
 * `branch` of `repoId`. Run inside the caller's fenced transaction.
 *
 * A commit is stored only when `shouldStoreCommit` says so: its `author.id`
 * must equal a linked member's github `provider_id`, compared as the number,
 * never by login, email or committer. The commit's identity fields are written
 * once, on insert. A SHA already stored keeps its row and only gains this
 * repo's provenance, so a fork cannot rewrite who authored it.
 */
async function storeMemberCommits(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  repoId: string,
  branch: string,
  commits: Commit[],
): Promise<number> {
  const authorIds = [
    ...new Set(commits.flatMap((c) => (c.author ? [String(c.author.id)] : []))),
  ];
  const members = new Map<string, string>();
  if (authorIds.length) {
    const rows = await tx.execute<{ providerId: string; userId: string }>(sql`
      select provider_id as "providerId", user_id as "userId"
      from auth.identities
      where provider = 'github'
        and provider_id in (${sql.join(
          authorIds.map((id) => sql`${id}`),
          sql`, `,
        )})`);
    for (const row of rows) members.set(row.providerId, row.userId);
  }
  let stored = 0;
  for (const c of commits) {
    const userId = c.author ? members.get(String(c.author.id)) : undefined;
    if (!shouldStoreCommit(userId) || !c.author) continue;
    // A malformed entry is skipped, not allowed to fail the whole page.
    if (!/^[0-9a-f]{40}$/.test(c.sha) || !c.commit?.committer?.date) continue;
    await tx.execute(sql`
      insert into platform.commits
        (sha, "githubRepoId", "authorGithubId", "authorLogin", "userId", "committedAt", message)
      values (${c.sha}, ${repoId}::bigint, ${String(c.author.id)}::bigint, ${c.author.login},
        ${userId}::uuid, ${c.commit.committer.date}::timestamptz,
        ${c.commit.message.replaceAll("\u0000", "")})
      on conflict (sha) do nothing`);
    await tx.execute(sql`
      insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch")
      values (${repoId}::bigint, ${c.sha}, ${branch}) on conflict do nothing`);
    stored++;
  }
  return stored;
}

/**
 * One listed page of a repo's scan, written under the repo's lease. Advances
 * the stored page only in the same transaction, so a crash re-reads a page at
 * worst. Returns `false` when the lease is no longer held.
 */
export async function saveCommitPage(
  id: string,
  token: string,
  branch: string,
  commits: Commit[],
  nextPage: number,
  database: Database = db,
) {
  return database.transaction(async (tx) => {
    const held = await tx.execute(
      sql`select 1 from platform."repoSyncState" where "githubRepoId"=${id}::bigint and "leaseToken"=${token}::uuid and "leaseUntil">now() for update`,
    );
    if (!held.length) return false;
    await storeMemberCommits(tx, id, branch, commits);
    await tx.execute(
      sql`update platform."repoSyncState" set "scanPage"=${nextPage} where "githubRepoId"=${id}::bigint and "leaseToken"=${token}::uuid`,
    );
    return true;
  });
}

/** Takes a repo's lease, or `undefined` when another worker holds it or backs it off. */
export async function claimRepo(
  id: string,
  database: Database = db,
): Promise<Scan | undefined> {
  await database.execute(
    sql`insert into platform."repoSyncState" ("githubRepoId") values (${id}::bigint) on conflict do nothing`,
  );
  const rows = await database.execute<Scan>(sql`
    update platform."repoSyncState" set "leaseToken"=gen_random_uuid(),
      "leaseUntil"=now()+${LEASE}, "lastAttemptAt"=now(), attempts=attempts+1
    where "githubRepoId"=${id}::bigint
      and ("leaseUntil" is null or "leaseUntil"<=now())
      and ("nextAttemptAt" is null or "nextAttemptAt"<=now())
    returning *, "githubRepoId"::text`);
  return rows[0];
}

/** Pins the head a scan walks, so paging stays stable while commits land. */
export async function checkpoint(
  id: string,
  token: string,
  head: string,
  since: Date | null,
  full: boolean,
  database: Database = db,
) {
  await database.execute(sql`
    update platform."repoSyncState" set "scanHeadSha"=${head},
      "scanSince"=${since?.toISOString() ?? null}::timestamptz, mode=${full ? "full" : "incremental"}
    where "githubRepoId"=${id}::bigint and "leaseToken"=${token}::uuid and "leaseUntil">now()`);
}

/**
 * Releases a repo's lease. `complete` is the only way `lastSucceededAt`
 * advances, and it also clears the pinned head so the next scan starts fresh.
 * Returns `false` when the lease had been lost, in which case nothing changes.
 */
export async function releaseRepo(
  id: string,
  token: string,
  complete: boolean,
  error: string | null = null,
  retryAt = new Date(),
  database: Database = db,
) {
  const rows = await database.execute(sql`
    update platform."repoSyncState" set "leaseToken"=null, "leaseUntil"=null,
      "nextAttemptAt"=${retryAt.toISOString()}::timestamptz,
      "lastError"=${error?.slice(0, 500) ?? null},
      "lastSucceededAt"=case when ${complete} then now() else "lastSucceededAt" end,
      "lastFullScanAt"=case when ${complete} and mode='full' then now() else "lastFullScanAt" end,
      "lastHeadSha"=case when ${complete} then "scanHeadSha" else "lastHeadSha" end,
      mode=case when ${complete} then 'incremental' else mode end,
      "scanPage"=case when ${complete} then 1 else "scanPage" end,
      "scanHeadSha"=case when ${complete} then null else "scanHeadSha" end,
      attempts=case when ${complete} then 0 else attempts end
    where "githubRepoId"=${id}::bigint and "leaseToken"=${token}::uuid and "leaseUntil">now()
    returning 1`);
  return rows.length > 0;
}

/**
 * Takes the sweep's lease. `start` is the daily cron, which begins a new
 * cycle when none is in progress; the continuation passes `false` and claims
 * only a cycle in progress or a member's pending backfill.
 *
 * A daily start that finds only a backfill-only cursor replaces it with a
 * sweep: the sweep's own backfill phase redoes any lost progress, which is
 * idempotent, whereas a cursor without `sweep` would complete without ever
 * reporting the heartbeat.
 */
export async function claimJob(
  start: boolean,
  database: Database = db,
): Promise<Job | undefined> {
  const rows = await database.execute<Job>(sql`
    update platform."projectSyncJobs" set "leaseToken"=gen_random_uuid(),
      "leaseUntil"=now()+${LEASE}, "lastAttemptAt"=now(), attempts=attempts+1,
      cursor=case
        when ${start} and (cursor='{}'::jsonb or cursor->>'sweep' is distinct from 'true')
          then '{"phase":"inventory","inventory":1,"sweep":true}'::jsonb
        when cursor='{}'::jsonb then '{"phase":"backfill"}'::jsonb
        else cursor end
    where job='commit-sync'
      and ("leaseUntil" is null or "leaseUntil"<=now())
      and ("nextAttemptAt" is null or "nextAttemptAt"<=now())
      and (${start} or cursor<>'{}'::jsonb or exists (
        select 1 from platform."commitBackfillRequests" b
        where b."completedAt" is null and b.attempts < ${MAX_BACKFILL_ATTEMPTS}
          and (b."leaseUntil" is null or b."leaseUntil"<=now())))
    returning "leaseToken", cursor`);
  return rows[0];
}

/**
 * Fenced completion of a sweep or continuation. A finished cycle clears the
 * cursor, and only a finished, clean sweep records the `platform-commit-sync`
 * heartbeat, in the same transaction as the lease release: a successful HTTP
 * batch is not a successful cycle. Returns `false` when the lease was lost.
 */
export async function releaseJob(
  token: string,
  cursor: Cursor,
  complete: boolean,
  heartbeat: boolean,
  error: string | null = null,
  retryAt = new Date(),
  database: Database = db,
) {
  return database.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      update platform."projectSyncJobs" set "leaseToken"=null, "leaseUntil"=null,
        cursor=${JSON.stringify(complete ? {} : cursor)}::jsonb,
        "nextAttemptAt"=${retryAt.toISOString()}::timestamptz,
        "lastError"=${error?.slice(0, 500) ?? null},
        "lastSucceededAt"=case when ${complete} then now() else "lastSucceededAt" end
      where job='commit-sync' and "leaseToken"=${token}::uuid and "leaseUntil">now()
      returning 1`);
    if (rows.length && complete && heartbeat)
      await tx.execute(sql`
        insert into platform."jobHeartbeats" (job, "succeededAt")
        values ('platform-commit-sync', now())
        on conflict (job) do update set "succeededAt"=now()`);
    return rows.length > 0;
  });
}

/**
 * Takes the oldest due backfill request, or `undefined` when none is due. A
 * request is due until completed, unless leased, backing off after a failure
 * (the lease column doubles as "not before" then) or out of attempts.
 */
export async function claimBackfill(
  database: Database = db,
): Promise<BackfillRequest | undefined> {
  const rows = await database.execute<BackfillRequest>(sql`
    update platform."commitBackfillRequests" r set "leaseToken"=gen_random_uuid(),
      "leaseUntil"=now()+${LEASE}
    where r."userId" = (
        select b."userId" from platform."commitBackfillRequests" b
        where b."completedAt" is null and b.attempts < ${MAX_BACKFILL_ATTEMPTS}
          and (b."leaseUntil" is null or b."leaseUntil"<=now())
        order by b."requestedAt", b."userId" limit 1 for update skip locked)
      and (r."leaseUntil" is null or r."leaseUntil"<=now())
    returning r."userId", r."githubId"::text as "githubId",
      r."requestedAt"::text as "requestedAt", r."leaseToken"`);
  return rows[0];
}

/**
 * One listed page of a member's backfill, stored under the request's lease.
 * Returns `false` when the lease is no longer held.
 */
export async function saveBackfillPage(
  request: BackfillRequest,
  repoId: string,
  branch: string,
  commits: Commit[],
  database: Database = db,
) {
  return database.transaction(async (tx) => {
    const held = await tx.execute(
      sql`select 1 from platform."commitBackfillRequests" where "userId"=${request.userId}::uuid and "leaseToken"=${request.leaseToken}::uuid and "leaseUntil">now() for update`,
    );
    if (!held.length) return false;
    await storeMemberCommits(tx, repoId, branch, commits);
    return true;
  });
}

/**
 * Marks a request done. It matches the `requestedAt` it was claimed at, so a
 * member who re-linked GitHub mid-walk (the identity trigger resets
 * `requestedAt` and `completedAt`) keeps the new request pending instead of
 * having it completed by the old walk.
 */
export async function completeBackfill(
  request: BackfillRequest,
  database: Database = db,
) {
  const rows = await database.execute(sql`
    update platform."commitBackfillRequests" set "completedAt"=now(),
      "leaseToken"=null, "leaseUntil"=null, "lastError"=null, attempts=0
    where "userId"=${request.userId}::uuid and "leaseToken"=${request.leaseToken}::uuid
      and "leaseUntil">now() and "requestedAt"=${request.requestedAt}::timestamptz
      and "completedAt" is null
    returning 1`);
  return rows.length > 0;
}

/** Gives a request's lease back, with no penalty, to resume next invocation. */
export async function releaseBackfill(
  request: BackfillRequest,
  database: Database = db,
) {
  await database.execute(sql`
    update platform."commitBackfillRequests" set "leaseToken"=null, "leaseUntil"=null
    where "userId"=${request.userId}::uuid and "leaseToken"=${request.leaseToken}::uuid`);
}

/** Records a failed attempt and backs the request off ten minutes per attempt, up to an hour. */
export async function failBackfill(
  request: BackfillRequest,
  error: string,
  database: Database = db,
) {
  await database.execute(sql`
    update platform."commitBackfillRequests" set attempts=attempts+1,
      "lastError"=${error.slice(0, 500)}, "leaseToken"=null,
      "leaseUntil"=now()+least(attempts+1, 6)*interval '10 minutes'
    where "userId"=${request.userId}::uuid and "leaseToken"=${request.leaseToken}::uuid`);
}

/** Commits awaiting size, each with one available repo it can be read from. */
export async function pendingStats(
  limit: number,
  database: Database = db,
): Promise<{ sha: string; owner: string; name: string }[]> {
  return database.execute<{ sha: string; owner: string; name: string }>(sql`
    select c.sha, r.owner, r.name from platform.commits c
    join lateral (
      select g.owner, g.name from platform."repoCommits" rc
      join platform."githubRepos" g using ("githubRepoId")
      where rc.sha = c.sha and g.health = 'available'
      order by g."githubRepoId" limit 1) r on true
    where c."statsState" = 'pending'
    order by c."firstSeenAt" limit ${limit}`);
}

/**
 * Settles a commit's size. `state` is `complete`, `truncated` (GitHub capped
 * the file list, so `files` stays unset and only additions and deletions are
 * kept) or `unavailable` (the commit can no longer be read). Only a commit
 * still pending is touched, so a repeat is harmless.
 */
export async function saveStats(
  sha: string,
  stats:
    | {
        state: "complete" | "truncated";
        files: number | null;
        additions: number;
        deletions: number;
      }
    | { state: "unavailable" },
  database: Database = db,
) {
  if (stats.state === "unavailable")
    await database.execute(
      sql`update platform.commits set "statsState"='unavailable' where sha=${sha} and "statsState"='pending'`,
    );
  else
    await database.execute(sql`
      update platform.commits set files=${stats.files}, additions=${stats.additions},
        deletions=${stats.deletions}, "statsState"=${stats.state}
      where sha=${sha} and "statsState"='pending'`);
}
