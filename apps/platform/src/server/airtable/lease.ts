import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import type { Refusal } from "./refusals";

/**
 * Mutual exclusion for the sync pass, and the manual trigger's rate limit.
 *
 * Both live in the `airtableSyncState` singleton rather than in an advisory
 * lock or an in-memory counter. The reasoning is in the migration
 * (`20260804000000_platform_airtable_sync_lease.sql`); the short version is
 * that a session-scoped advisory lock cannot be released reliably through a
 * transaction-mode pooler, and an in-memory counter is per isolate, which is
 * to say per request on Workers.
 */

/**
 * How long a claimed lease stays valid.
 *
 * Long enough that a slow pass — a few hundred records, backing off a 429 or
 * two — never has its lease stolen mid-flight. Short enough that a worker
 * killed between claim and release blocks the sync for one missed cron cycle
 * rather than until somebody notices.
 */
export const LEASE_MINUTES = 10;

/** One manual run a minute, whoever asks. Global, not per caller. */
export const MANUAL_COOLDOWN_SECONDS = 60;

export type ClaimResult =
  | { ok: true; lastSyncedAt: Date | null }
  | {
      ok: false;
      reason: "already_running" | "rate_limited";
      retryAfter: number;
    };

// `db.execute` constrains its row type to Record<string, unknown>, so these
// carry an index signature. Only the raw-SQL row shapes do — the exported
// types below stay closed.
interface ClaimRow extends Record<string, unknown> {
  lastSyncedAt: Date | null;
  runExpiresAt: Date | null;
  cooldownEndsAt: Date | null;
}

/**
 * Claims the right to run a pass, or explains why not.
 *
 * The claim and the checks are one statement so there is no window between
 * "nobody is running" and "I am running" for a second caller to slip through.
 * A conditional UPDATE ... RETURNING is atomic under MVCC: two concurrent
 * callers serialize on the row, and the loser sees the winner's committed
 * `runExpiresAt` and matches zero rows.
 *
 * Note this is why the failure branch re-reads instead of trusting what it
 * knew: the losing caller's own earlier read is stale by definition.
 */
export async function claimSyncLease(
  trigger: "cron" | "manual",
  triggeredBy: string | null,
): Promise<ClaimResult> {
  const manual = trigger === "manual";

  const claimed = await db.execute<ClaimRow>(sql`
    update "platform"."airtableSyncState"
    set "runStartedAt"    = now(),
        "runExpiresAt"    = now() + make_interval(mins => ${LEASE_MINUTES}),
        "lastStatus"      = 'running',
        "lastManualRunAt" = case when ${manual} then now() else "lastManualRunAt" end,
        "lastManualRunBy" = case when ${manual} then ${triggeredBy}::uuid else "lastManualRunBy" end
    where "id"
      and ("runExpiresAt" is null or "runExpiresAt" <= now())
      and (
        not ${manual}
        or "lastManualRunAt" is null
        or "lastManualRunAt" <= now() - make_interval(secs => ${MANUAL_COOLDOWN_SECONDS})
      )
    returning "lastSyncedAt", "runExpiresAt", null::timestamptz as "cooldownEndsAt"
  `);

  const row = claimed[0];
  if (row) return { ok: true, lastSyncedAt: row.lastSyncedAt };

  // Lost the race, or hit the cooldown. Re-read to say which — the two are
  // very different messages to put in front of an officer, and "already
  // running" is the one that means "your edit is being picked up right now".
  const [state] = await db.execute<ClaimRow>(sql`
    select
      "lastSyncedAt",
      "runExpiresAt",
      "lastManualRunAt" + make_interval(secs => ${MANUAL_COOLDOWN_SECONDS}) as "cooldownEndsAt"
    from "platform"."airtableSyncState"
    where "id"
  `);

  const now = Date.now();
  const running =
    state?.runExpiresAt != null && new Date(state.runExpiresAt).getTime() > now;

  if (running) {
    return {
      ok: false,
      reason: "already_running",
      retryAfter: secondsUntil(state.runExpiresAt, now),
    };
  }

  return {
    ok: false,
    reason: "rate_limited",
    retryAfter: secondsUntil(state?.cooldownEndsAt ?? null, now),
  };
}

function secondsUntil(at: Date | string | null, now: number): number {
  if (at === null) return MANUAL_COOLDOWN_SECONDS;
  return Math.max(1, Math.ceil((new Date(at).getTime() - now) / 1000));
}

export interface LeaseRelease {
  status: "ok" | "failed";
  error: string | null;
  rowsUpserted: number;
  rowsRefused: number;
  rowsArchived: number;
  refusals: Refusal[];
  /**
   * The window this pass covered. Written to `lastSyncedAt` only on success —
   * a partial pass must re-fetch the same window rather than skip it, because
   * the records it did not reach are indistinguishable from the ones it did.
   */
  syncedAt: Date | null;
}

/**
 * Releases the lease and records the outcome.
 *
 * Always runs, including on failure — an exception that skipped this would
 * leave the sync blocked for a full lease period with `lastStatus` stuck on
 * "running", which reads like a hang rather than like the error it was.
 */
export async function releaseSyncLease(result: LeaseRelease): Promise<void> {
  await db.execute(sql`
    update "platform"."airtableSyncState"
    set "runStartedAt"  = null,
        "runExpiresAt"  = null,
        "lastStatus"    = ${result.status},
        "lastError"     = ${result.error},
        "rowsUpserted"  = ${result.rowsUpserted},
        "rowsRefused"   = ${result.rowsRefused},
        "rowsArchived"  = ${result.rowsArchived},
        "lastRefusals"  = ${JSON.stringify(result.refusals)}::jsonb,
        "lastSyncedAt"  = coalesce(${result.syncedAt?.toISOString() ?? null}::timestamptz, "lastSyncedAt")
    where "id"
  `);
}

/**
 * The states a pass can refuse in, both recorded before the lease is claimed.
 *
 * `schema_invalid` — the base no longer matches the registry.
 * `not_configured` — there is no sync token to talk to it with.
 */
export type RefusalStatus = "schema_invalid" | "not_configured";

/**
 * Records a refusal on the state row, and reports what the status was before.
 *
 * A refusal happens BEFORE the lease is claimed and deliberately stays that way
 * (see `runAirtableSync`) — but that left the console showing the last
 * *successful* pass with no sign that every pass since had refused. Drift was
 * only visible to somebody who manually triggered a sync, which is exactly the
 * person who already suspects something is wrong.
 *
 * The returned previous status is what makes alerting possible without spamming:
 * the cron refuses 96 times a day, and only the transition into that state is
 * news.
 *
 * ⚠️ Skips the write when a run currently holds the lease. A refusing pass and
 * a running pass can interleave, and clobbering `lastStatus = 'running'` would
 * make a live sync look finished.
 */
export async function recordRefusal(
  status: RefusalStatus,
  detail: string[],
): Promise<SchemaRefusalRecord> {
  const findings = detail;
  // `prev` and `upd` share one snapshot, so `prev` reads the value from before
  // the update. `RETURNING` alone would not do it: without `OLD` (Postgres 18)
  // it yields the row as updated, which here is always the status being
  // written -- a transition check that reports "no change" every single time,
  // i.e. an alert that never fires.
  const [row] = await db.execute<{
    previous: string | null;
    persisted: boolean;
  }>(sql`
    with prev as (
      select "lastStatus" as "previous"
      from "platform"."airtableSyncState"
      where "id"
    ), upd as (
      update "platform"."airtableSyncState"
      set "lastStatus" = ${status},
          "lastError"  = ${findings.join("; ")}
      where "id"
        and ("runExpiresAt" is null or "runExpiresAt" < now())
      returning 1
    )
    select prev."previous", exists (select 1 from upd) as "persisted"
    from prev
  `);

  return {
    previous: row?.previous ?? null,
    persisted: row?.persisted ?? false,
  };
}

export interface SchemaRefusalRecord {
  /** `lastStatus` as it was before this refusal was recorded. */
  previous: string | null;
  /** False when a run held the lease, so nothing was written. */
  persisted: boolean;
}

export interface SyncStateSnapshot {
  lastSyncedAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  rowsUpserted: number;
  rowsRefused: number;
  rowsArchived: number;
  lastRefusals: Refusal[] | null;
  lastManualRunAt: Date | null;
  lastManualRunBy: string | null;
  running: boolean;
}

interface StateRow
  extends Record<string, unknown>, Omit<SyncStateSnapshot, "running"> {
  runExpiresAt: Date | null;
}

/** What the officer console shows without triggering anything. */
export async function readSyncState(): Promise<SyncStateSnapshot | null> {
  const [row] = await db.execute<StateRow>(sql`
    select "lastSyncedAt", "lastStatus", "lastError", "rowsUpserted",
           "rowsRefused", "rowsArchived", "lastRefusals", "lastManualRunAt",
           "lastManualRunBy", "runExpiresAt"
    from "platform"."airtableSyncState"
    where "id"
  `);

  if (!row) return null;

  return {
    ...row,
    running:
      row.runExpiresAt != null &&
      new Date(row.runExpiresAt).getTime() > Date.now(),
  };
}
