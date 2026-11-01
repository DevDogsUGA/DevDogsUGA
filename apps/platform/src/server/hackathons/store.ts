/**
 * The Devpost sync's database writes. Everything that must be atomic or fenced
 * lives here, so the sync logic above it can be tested with these mocked and
 * these can be tested against a real database (`store.db-test.ts`).
 *
 * Three rules hold throughout:
 *
 * - A write that continues earlier work carries the lease token it was
 *   claimed with and fails, returning `false`, when the lease is no longer
 *   held, so a worker whose lease expired cannot overwrite a newer worker's
 *   progress.
 * - A hackathon whose source is `other` is never overwritten. The one thing
 *   that can happen to one is that Devpost turns out to list the same page: it
 *   then takes on that Devpost identity (see `upsertDevpostHackathon`).
 * - Nothing here deletes a hackathon. A record missing from the feed stays.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import type { DevpostHackathon } from "./devpost";

type Database = typeof db;

/**
 * Where a cycle stopped, held in `projectSyncJobs.cursor`. It carries Devpost
 * event ids and counts only, never names or content, and stays far under the
 * column's 16 KB limit (`MAX_SEEN` ids of at most seven digits).
 */
export type Cursor = {
  /** The next page to read. Absent when no cycle is in progress. */
  page?: number;
  /** Every id the cycle has seen, to know when the whole feed has been. */
  seen?: number[];
  idless?: number;
  /** An item failed to store this cycle, so finishing it is not a success. */
  dirty?: true;
  /** Consecutive failed runs, for the backoff. A finished cycle resets it. */
  failures?: number;
};
export type Job = { leaseToken: string; cursor: Cursor };

const LEASE = sql`interval '2 minutes'`;

/**
 * Takes the job's lease. `start` is the daily cron, which begins a new cycle
 * from page 1 (and is not held back by a backoff: one request a day is the
 * retry); the continuation passes `false` and claims only a cycle in progress
 * that is due. Either way a held lease is respected.
 *
 * The job's row is inserted if it is missing, so a database that never ran
 * the seed is not a reason for the sync to do nothing, silently.
 */
export async function claimJob(
  start: boolean,
  database: Database = db,
): Promise<Job | undefined> {
  await database.execute(
    sql`insert into platform."projectSyncJobs" (job) values ('devpost-sync') on conflict do nothing`,
  );
  const rows = await database.execute<Job>(sql`
    update platform."projectSyncJobs" set "leaseToken"=gen_random_uuid(),
      "leaseUntil"=now()+${LEASE}, "lastAttemptAt"=now(), attempts=attempts+1,
      cursor=case when ${start}
        then jsonb_build_object('page', 1, 'seen', '[]'::jsonb, 'idless', 0,
          'failures', coalesce((cursor->>'failures')::int, 0))
        else cursor end
    where job='devpost-sync'
      and ("leaseUntil" is null or "leaseUntil"<=now())
      and (${start} or (cursor->'page' is not null
        and ("nextAttemptAt" is null or "nextAttemptAt"<=now())))
    returning "leaseToken", cursor`);
  return rows[0];
}

/**
 * Fenced end of one invocation. `cursor` is what to resume from (`{}` when
 * there is nothing to resume); `succeeded` records a finished cycle and
 * `heartbeat` writes `platform-devpost-sync` in the same transaction, so a
 * successful HTTP batch is never mistaken for a successful cycle. Returns
 * `false` when the lease was lost.
 */
export async function releaseJob(
  token: string,
  end: {
    cursor: Cursor;
    succeeded: boolean;
    heartbeat: boolean;
    error?: string | null;
    retryAt?: Date;
  },
  database: Database = db,
) {
  return database.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      update platform."projectSyncJobs" set "leaseToken"=null, "leaseUntil"=null,
        cursor=${JSON.stringify(end.cursor)}::jsonb,
        "nextAttemptAt"=${(end.retryAt ?? new Date()).toISOString()}::timestamptz,
        "lastError"=${end.error?.slice(0, 500) ?? null},
        "lastSucceededAt"=case when ${end.succeeded} then now() else "lastSucceededAt" end
      where job='devpost-sync' and "leaseToken"=${token}::uuid and "leaseUntil">now()
      returning 1`);
    if (rows.length && end.succeeded && end.heartbeat)
      await tx.execute(sql`
        insert into platform."jobHeartbeats" (job, "succeededAt")
        values ('platform-devpost-sync', now())
        on conflict (job) do update set "succeededAt"=now()`);
    return rows.length > 0;
  });
}

export type Upsert =
  /** A new Devpost record. */
  | "inserted"
  /** A Devpost record refreshed. */
  | "updated"
  /** A member-submitted page that Devpost lists too, now a Devpost record. */
  | "attached"
  /** Left alone: the page is on file under another identity, or was declined. */
  | "conflict";

const PG_UNIQUE = "23505";
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if ((current as { code?: string }).code === PG_UNIQUE) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

type Existing = {
  id: string;
  source: string;
  approval: string;
  url: string;
  devpostId: string | null;
};

async function reconcile(item: DevpostHackathon, database: Database) {
  return database.transaction(async (tx): Promise<Upsert> => {
    const id = String(item.devpostId);
    const [known] = await tx.execute<Existing>(sql`
      select id, source, approval, url, "devpostId"::text as "devpostId"
      from platform.hackathons where "devpostId"=${id}::bigint for update`);
    if (known) {
      // Devpost moved the event to a link another record already holds: keep
      // the old link and refresh everything else.
      const [holder] = await tx.execute<{ id: string }>(sql`
        select id from platform.hackathons
        where url=${item.url} and id<>${known.id}::uuid`);
      await tx.execute(sql`
        update platform.hackathons set name=${item.name},
          url=${holder ? known.url : item.url}, location=${item.location},
          online=true, "openState"=${item.openState}, "dateLabel"=${item.dateLabel},
          "startsOn"=${item.startsOn}::date, "endsOn"=${item.endsOn}::date,
          "lastSeenAt"=now()
        where id=${known.id}::uuid`);
      return holder ? "conflict" : "updated";
    }
    const [sameLink] = await tx.execute<Existing>(sql`
      select id, source, approval, url, "devpostId"::text as "devpostId"
      from platform.hackathons where url=${item.url} for update`);
    if (sameLink) {
      // A different Devpost id on this link, or a decision against it: an
      // identity we must not overwrite or resurrect.
      if (sameLink.source === "devpost" || sameLink.approval === "declined")
        return "conflict";
      // The link is on file from a member or an officer. Devpost has now
      // verified it, so it takes the Devpost identity and stays one row: its
      // Submissions keep pointing at it.
      await tx.execute(sql`
        update platform.hackathons set source='devpost', "devpostId"=${id}::bigint,
          approval='approved', "decidedAt"=coalesce("decidedAt", now()),
          name=${item.name}, location=${item.location}, online=true,
          "openState"=${item.openState}, "dateLabel"=${item.dateLabel},
          "startsOn"=${item.startsOn}::date, "endsOn"=${item.endsOn}::date,
          "lastSeenAt"=now()
        where id=${sameLink.id}::uuid`);
      return "attached";
    }
    await tx.execute(sql`
      insert into platform.hackathons (source, "devpostId", url, name, location,
        online, "openState", "dateLabel", "startsOn", "endsOn", approval, "decidedAt", "lastSeenAt")
      values ('devpost', ${id}::bigint, ${item.url}, ${item.name}, ${item.location},
        true, ${item.openState}, ${item.dateLabel}, ${item.startsOn}::date,
        ${item.endsOn}::date, 'approved', now(), now())`);
    return "inserted";
  });
}

/**
 * Stores one feed item, keyed by its Devpost id, in its own transaction so a
 * bad item costs nothing else on the page.
 *
 * The cases, in order: the id is known (refresh it); the link is on file under
 * no Devpost id (attach the identity, keeping the row and its Submissions); the
 * link belongs to another Devpost id, or to a declined record (leave it, report
 * `conflict`); otherwise insert. A write that loses a race to a member's
 * submission of the same link hits the unique constraint and is retried once
 * against what that submission left.
 */
export async function upsertDevpostHackathon(
  item: DevpostHackathon,
  database: Database = db,
): Promise<Upsert> {
  try {
    return await reconcile(item, database);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return reconcile(item, database);
  }
}
