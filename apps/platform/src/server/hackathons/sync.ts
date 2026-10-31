/**
 * The Devpost sync: every online, open or upcoming hackathon on Devpost's
 * public feed, stored as an approved `devpost` Hackathon (D0 section 5, Q32).
 *
 * The feed is undocumented, so the job fails softly. A bad page, a rate limit,
 * a timeout or a changed schema keeps whatever the last good run stored,
 * backs off, and leaves the `platform-devpost-sync` heartbeat to go overdue
 * (`/cron/heartbeats` reports that). It never deletes a record, and never
 * throws: the cron route answers 200 and the next continuation retries.
 *
 * One invocation reads at most `MAX_PAGES_PER_RUN` pages or `MAX_RUN_MS`, then
 * saves the cursor, so a long feed spans runs. The daily cron starts a cycle
 * at page 1; the fifteen-minute dispatcher resumes one in progress and starts
 * nothing. A cycle ends when the pages have shown `meta.total_count` distinct
 * events, or one comes back empty. It is a success, and writes the heartbeat,
 * only if it ended that way with every item stored; a feed that repeats a
 * page, runs past `MAX_PAGES_PER_CYCLE` or `MAX_SEEN`, or an item that
 * failed to store ends it unsuccessfully.
 */
import "server-only";
import {
  fetchDevpostPage,
  type DevpostPage,
  type DevpostResult,
} from "./devpost";
import {
  claimJob,
  releaseJob,
  upsertDevpostHackathon,
  type Cursor,
  type Upsert,
} from "./store";

export const MAX_PAGES_PER_RUN = 12;
export const MAX_RUN_MS = 25_000;
/** A cycle that has not finished by here is not a feed we understand. */
export const MAX_PAGES_PER_CYCLE = 50;
export const MAX_SEEN = 1000;
/** Politeness between two requests to the same host. */
const PAGE_DELAY_MS = 400;
const BACKOFF_BASE_MS = 15 * 60_000;
const BACKOFF_MAX_MS = 6 * 3_600_000;

/** The wait after the `failures`th consecutive failed run: 15 minutes, doubling, to 6 hours. */
export function backoffMs(failures: number): number {
  return Math.min(
    BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1),
    BACKOFF_MAX_MS,
  );
}

export type DevpostSyncRun = {
  /** Whether the invocation ran at all: false when another worker held the lease or nothing was due. */
  ran: boolean;
  /** A cycle finished and was recorded as a success. */
  complete: boolean;
  pages: number;
  counts: Record<Upsert | "failed" | "dropped" | "skipped", number>;
  /** Why the run stopped short, when it did. Soft: it is not an error response. */
  failure?: string;
};

type Deps = {
  fetchPage: (page: number) => Promise<DevpostResult<DevpostPage>>;
  sleep: (ms: number) => Promise<void>;
};
const defaults: Deps = {
  fetchPage: (page) => fetchDevpostPage(page),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * One invocation of the sync. `start` is the daily cron; the continuation
 * passes `false`. Never throws: a failure anywhere is recorded on the job and
 * returned as `failure`.
 */
export async function runDevpostSync(
  start: boolean,
  deps: Deps = defaults,
): Promise<DevpostSyncRun> {
  const run: DevpostSyncRun = {
    ran: false,
    complete: false,
    pages: 0,
    counts: {
      inserted: 0,
      updated: 0,
      attached: 0,
      conflict: 0,
      failed: 0,
      dropped: 0,
      skipped: 0,
    },
  };
  let token: string | undefined;
  let cursor: Cursor = {};
  try {
    const job = await claimJob(start);
    if (!job) return run;
    run.ran = true;
    token = job.leaseToken;
    cursor = job.cursor;
    const deadline = Date.now() + MAX_RUN_MS;
    // `done` is the cycle's end; `failure` is a reason to stop and back off.
    let done: "complete" | "abandoned" | undefined;
    let failure: { message: string; retryAt?: Date; kind: string } | undefined;

    while (!done && !failure) {
      const page = cursor.page ?? 1;
      if (page > MAX_PAGES_PER_CYCLE) {
        failure = {
          kind: "limit",
          message: "The feed ran past the page limit.",
        };
        done = "abandoned";
        break;
      }
      if (run.pages >= MAX_PAGES_PER_RUN || Date.now() >= deadline) break;
      if (run.pages > 0) await deps.sleep(PAGE_DELAY_MS);
      const result = await deps.fetchPage(page);
      run.pages += 1;
      if (!result.ok) {
        failure = result;
        break;
      }
      const data = result.data;
      run.counts.dropped += data.dropped;
      run.counts.skipped += data.skipped;
      if (data.ids.length + data.idless === 0) {
        // An empty page ends the feed, unless it is the first one and the
        // feed claims to have events: then the page parameter stopped working.
        if (!cursor.seen?.length && data.totalCount > 0)
          failure = { kind: "shape", message: "The first page was empty." };
        else done = "complete";
        break;
      }
      let dirty = cursor.dirty === true;
      for (const item of data.items) {
        try {
          run.counts[await upsertDevpostHackathon(item)] += 1;
        } catch (error) {
          // One item failing to store is not a reason to lose the page.
          run.counts.failed += 1;
          dirty = true;
          console.error("hackathons_devpost_item_failed", {
            devpostId: item.devpostId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const seen = new Set(cursor.seen ?? []);
      const before = seen.size;
      for (const id of data.ids) seen.add(id);
      const idless = (cursor.idless ?? 0) + data.idless;
      cursor = {
        ...cursor,
        page: page + 1,
        seen: [...seen],
        idless,
        ...(dirty ? { dirty: true as const } : {}),
      };
      if (seen.size + idless >= data.totalCount) done = "complete";
      else if (seen.size === before && data.idless === 0) {
        // The same page again: the feed ignored `page`, or shifted under us.
        failure = { kind: "repeat", message: "Devpost repeated a page." };
        done = "abandoned";
      } else if (seen.size > MAX_SEEN) {
        failure = {
          kind: "limit",
          message: "The feed is larger than the limit.",
        };
        done = "abandoned";
      }
    }

    // A run that stopped without failing made progress, which ends a streak.
    const failures = failure ? (cursor.failures ?? 0) + 1 : 0;
    if (failure) {
      run.failure = failure.message;
      const detail = {
        kind: failure.kind,
        message: failure.message,
        page: cursor.page ?? 1,
      };
      if (failure.kind === "rate")
        console.warn("hackathons_devpost_sync_failed", detail);
      else console.error("hackathons_devpost_sync_failed", detail);
    }
    const clean = done === "complete" && cursor.dirty !== true;
    if (done === "complete" && !clean)
      run.failure = "An item could not be stored this cycle.";
    await releaseJob(token, {
      // A finished cycle leaves nothing to resume. An abandoned one keeps only
      // the failure count, so the next daily start backs off from it.
      cursor:
        done === "complete" && clean
          ? {}
          : done
            ? { failures }
            : { ...cursor, failures },
      succeeded: clean,
      heartbeat: clean,
      error: run.failure ?? null,
      retryAt: failure
        ? new Date(
            Math.max(
              Date.now() + backoffMs(failures),
              Math.min(
                failure.retryAt?.getTime() ?? 0,
                Date.now() + BACKOFF_MAX_MS,
              ),
            ),
          )
        : undefined,
    });
    run.complete = clean;
    return run;
  } catch (error) {
    // A storage failure is as soft as an upstream one: the lease is released
    // with the error and the heartbeat is left overdue.
    run.failure = "Devpost sync storage failed";
    console.error("hackathons_devpost_sync_failed", {
      kind: "storage",
      message: error instanceof Error ? error.message : String(error),
    });
    if (token)
      await releaseJob(token, {
        cursor: { ...cursor, failures: (cursor.failures ?? 0) + 1 },
        succeeded: false,
        heartbeat: false,
        error: run.failure,
        retryAt: new Date(Date.now() + backoffMs((cursor.failures ?? 0) + 1)),
      }).catch(() => undefined);
    return run;
  }
}
