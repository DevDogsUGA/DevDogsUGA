// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevpostHackathon, DevpostPage, DevpostResult } from "./devpost";
import type { Cursor } from "./store";

const store = vi.hoisted(() => ({
  claimJob: vi.fn(),
  releaseJob: vi.fn(),
  upsertDevpostHackathon: vi.fn(),
}));
vi.mock("./store", () => store);

const {
  backoffMs,
  MAX_PAGES_PER_CYCLE,
  MAX_PAGES_PER_RUN,
  MAX_SEEN,
  runDevpostSync,
} = await import("./sync");

const NOW = new Date("2026-11-01T12:00:00.000Z");
const HOUR = 3_600_000;

const hackathon = (devpostId: number): DevpostHackathon => ({
  devpostId,
  name: `Hack ${devpostId}`,
  url: `https://h${devpostId}.devpost.com/`,
  location: "Online",
  openState: "open",
  dateLabel: null,
  startsOn: null,
  endsOn: null,
});
const page = (
  ids: number[],
  totalCount: number,
  over: Partial<DevpostPage> = {},
): DevpostResult<DevpostPage> => ({
  ok: true,
  data: {
    items: ids.map(hackathon),
    totalCount,
    ids,
    idless: 0,
    dropped: 0,
    skipped: 0,
    ...over,
  },
});
const rateLimited = (retryAt?: Date): DevpostResult<DevpostPage> => ({
  ok: false,
  kind: "rate",
  message: "Devpost answered 429.",
  retryAt,
});

/** A feed, as the pages `fetchPage` returns in order. */
function run(
  start: boolean,
  pages: DevpostResult<DevpostPage>[],
  job: { cursor?: Record<string, unknown> } = {},
) {
  const sleep = vi.fn(async () => undefined);
  const fetchPage = vi.fn(
    async (n: number) => pages[n - 1] ?? pages[pages.length - 1]!,
  );
  store.claimJob.mockResolvedValue({
    leaseToken: "lease-1",
    cursor: job.cursor ?? { page: 1, seen: [], idless: 0, failures: 0 },
  });
  return {
    sleep,
    fetchPage,
    done: runDevpostSync(start, { fetchPage, sleep }),
  };
}
type End = {
  cursor: Cursor;
  succeeded: boolean;
  heartbeat: boolean;
  error?: string | null;
  retryAt: Date;
};
const released = () =>
  store.releaseJob.mock.calls.at(-1)! as unknown as [string, End];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.resetAllMocks();
  store.releaseJob.mockResolvedValue(true);
  store.upsertDevpostHackathon.mockResolvedValue("inserted");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("backoffMs", () => {
  it("starts at 15 minutes, doubles, and stops at 6 hours", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map((n) => backoffMs(n) / 60_000)).toEqual(
      [15, 30, 60, 120, 240, 360, 360, 360],
    );
  });
  it("treats zero or fewer failures as the first", () => {
    expect(backoffMs(0)).toBe(15 * 60_000);
    expect(backoffMs(-3)).toBe(15 * 60_000);
  });
});

describe("a clean cycle", () => {
  it("upserts every item, finishes on total_count, and writes the heartbeat once", async () => {
    store.upsertDevpostHackathon
      .mockResolvedValueOnce("inserted")
      .mockResolvedValueOnce("updated")
      .mockResolvedValueOnce("attached")
      .mockResolvedValueOnce("conflict");
    const { done, fetchPage } = run(true, [page([1, 2], 4), page([3, 4], 4)]);
    const result = await done;
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ran: true,
      complete: true,
      pages: 2,
      counts: { inserted: 1, updated: 1, attached: 1, conflict: 1, failed: 0 },
    });
    expect(result.failure).toBeUndefined();
    expect(store.claimJob).toHaveBeenCalledWith(true);
    expect(store.releaseJob).toHaveBeenCalledOnce();
    const [token, end] = released();
    expect(token).toBe("lease-1");
    expect(end).toMatchObject({
      cursor: {},
      succeeded: true,
      heartbeat: true,
      error: null,
      retryAt: undefined,
    });
  });

  it("waits between requests but not before the first", async () => {
    const { done, sleep } = run(true, [
      page([1], 3),
      page([2], 3),
      page([3], 3),
    ]);
    await done;
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("is idempotent: the same feed run twice gives the same complete cycle", async () => {
    const feed = [page([1, 2], 2)];
    const first = await run(true, feed).done;
    const second = await run(true, feed).done;
    expect(first.complete && second.complete).toBe(true);
    expect(store.upsertDevpostHackathon).toHaveBeenCalledTimes(4);
    expect(
      store.upsertDevpostHackathon.mock.calls.map(
        ([item]) => (item as DevpostHackathon).devpostId,
      ),
    ).toEqual([1, 2, 1, 2]);
  });

  it("counts dropped and skipped items without failing", async () => {
    const result = await run(true, [
      page([1], 3, { dropped: 1, skipped: 1, ids: [1, 2, 3] }),
    ]).done;
    expect(result.counts).toMatchObject({ dropped: 1, skipped: 1 });
    expect(result.complete).toBe(true);
  });

  it("ends on an empty page after the first", async () => {
    const result = await run(true, [page([1, 2], 99), page([], 99)]).done;
    expect(result.complete).toBe(true);
    expect(released()[1]).toMatchObject({ succeeded: true, heartbeat: true });
  });

  it("counts ids without an id toward the total", async () => {
    const result = await run(true, [page([1], 2, { idless: 1 })]).done;
    expect(result.complete).toBe(true);
  });
});

describe("a cycle that continues", () => {
  it("passes the claim's start flag and does nothing when no lease is granted", async () => {
    store.claimJob.mockResolvedValue(undefined);
    const fetchPage = vi.fn();
    const result = await runDevpostSync(false, {
      fetchPage,
      sleep: async () => undefined,
    });
    expect(store.claimJob).toHaveBeenCalledWith(false);
    expect(result).toMatchObject({ ran: false, complete: false, pages: 0 });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(store.releaseJob).not.toHaveBeenCalled();
  });

  it("saves the cursor at the per-run page cap and resumes from it", async () => {
    const pages = Array.from({ length: 30 }, (_, i) =>
      page([i * 2 + 1, i * 2 + 2], 100),
    );
    const first = run(true, pages);
    const result = await first.done;
    expect(first.fetchPage).toHaveBeenCalledTimes(MAX_PAGES_PER_RUN);
    expect(result).toMatchObject({
      ran: true,
      complete: false,
      pages: MAX_PAGES_PER_RUN,
    });
    const [, end] = released();
    expect(end).toMatchObject({
      succeeded: false,
      heartbeat: false,
      error: null,
    });
    expect(end.cursor.page).toBe(MAX_PAGES_PER_RUN + 1);
    expect(end.cursor.seen).toHaveLength(MAX_PAGES_PER_RUN * 2);
    expect(end.cursor.failures).toBe(0);

    const resumed = run(false, pages, { cursor: end.cursor });
    await resumed.done;
    expect(resumed.fetchPage.mock.calls[0]).toEqual([MAX_PAGES_PER_RUN + 1]);
  });

  it("stops at the time budget and keeps the cursor", async () => {
    const sleep = vi.fn(async (ms: number) => {
      vi.setSystemTime(Date.now() + 30_000 + ms);
    });
    const fetchPage = vi.fn(async (n: number) => page([n], 100));
    store.claimJob.mockResolvedValue({ leaseToken: "t", cursor: { page: 1 } });
    const result = await runDevpostSync(true, { fetchPage, sleep });
    expect(result.pages).toBe(1 + 1);
    expect(result.complete).toBe(false);
    expect(released()[1].cursor.page).toBe(3);
  });
});

describe("a failing feed fails softly", () => {
  it("never throws, keeps the cursor, and leaves the heartbeat unwritten", async () => {
    const result = await run(true, [
      page([1, 2], 10),
      { ok: false, kind: "http", message: "Devpost answered 500." },
    ]).done;
    expect(result).toMatchObject({
      ran: true,
      complete: false,
      failure: "Devpost answered 500.",
    });
    expect(result.counts.inserted).toBe(2);
    const [, end] = released();
    expect(end).toMatchObject({
      succeeded: false,
      heartbeat: false,
      error: "Devpost answered 500.",
    });
    expect(end.cursor).toMatchObject({ page: 2, seen: [1, 2], failures: 1 });
    expect(end.retryAt.getTime()).toBe(NOW.getTime() + backoffMs(1));
    expect(console.error).toHaveBeenCalledWith(
      "hackathons_devpost_sync_failed",
      expect.objectContaining({ kind: "http", page: 2 }),
    );
  });

  it("warns, not errors, on a rate limit, and honours Retry-After past the backoff", async () => {
    const retryAt = new Date(NOW.getTime() + 2 * HOUR);
    await run(true, [rateLimited(retryAt)]).done;
    const [, end] = released();
    expect(end.retryAt).toEqual(retryAt);
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("caps a Retry-After at the backoff ceiling and never goes below the backoff", async () => {
    await run(true, [rateLimited(new Date(NOW.getTime() + 100 * HOUR))]).done;
    expect(released()[1].retryAt.getTime()).toBe(NOW.getTime() + 6 * HOUR);
    await run(true, [rateLimited(new Date(NOW.getTime() + 1_000))]).done;
    expect(released()[1].retryAt.getTime()).toBe(NOW.getTime() + backoffMs(1));
  });

  it("backs off further on each consecutive failure and counts them in the cursor", async () => {
    await run(false, [rateLimited()], {
      cursor: { page: 3, seen: [1], failures: 2 },
    }).done;
    const [, end] = released();
    expect(end.cursor.failures).toBe(3);
    expect(end.retryAt.getTime()).toBe(NOW.getTime() + backoffMs(3));
  });

  it("resets the failure streak when a run makes progress", async () => {
    const pages = Array.from({ length: 30 }, (_, i) => page([i + 100], 100));
    await run(false, pages, {
      cursor: { page: 2, seen: [1, 2, 3], failures: 4 },
    }).done;
    expect(released()[1].cursor.failures).toBe(0);
  });

  it("fails an empty first page when the feed claims events", async () => {
    const result = await run(true, [page([], 80)]).done;
    expect(result).toMatchObject({
      complete: false,
      failure: "The first page was empty.",
    });
    expect(released()[1]).toMatchObject({ succeeded: false, heartbeat: false });
  });

  it("abandons a cycle when the feed repeats a page, keeping only the failure count", async () => {
    const result = await run(true, [page([1, 2], 50), page([1, 2], 50)]).done;
    expect(result).toMatchObject({
      complete: false,
      failure: "Devpost repeated a page.",
    });
    const [, end] = released();
    expect(end.cursor).toEqual({ failures: 1 });
    expect(end).toMatchObject({ succeeded: false, heartbeat: false });
    expect(end.retryAt.getTime()).toBe(NOW.getTime() + backoffMs(1));
  });

  it("abandons a cycle that runs past the page limit", async () => {
    const result = await run(false, [page([1], 5)], {
      cursor: { page: MAX_PAGES_PER_CYCLE + 1, seen: [9], failures: 0 },
    }).done;
    expect(result).toMatchObject({
      complete: false,
      failure: "The feed ran past the page limit.",
      pages: 0,
    });
    expect(released()[1].cursor).toEqual({ failures: 1 });
  });

  it("abandons a cycle that has seen more than the id limit", async () => {
    const ids = Array.from({ length: MAX_SEEN + 1 }, (_, i) => i + 1);
    const result = await run(true, [
      page(ids.slice(0, 1), MAX_SEEN * 3, { ids }),
    ]).done;
    expect(result.failure).toBe("The feed is larger than the limit.");
    expect(released()[1].cursor).toEqual({ failures: 1 });
  });

  it("stores the other items when one fails, then ends unsuccessfully", async () => {
    store.upsertDevpostHackathon
      .mockResolvedValueOnce("inserted")
      .mockRejectedValueOnce(new Error("constraint"))
      .mockResolvedValueOnce("updated");
    const result = await run(true, [page([1, 2, 3], 3)]).done;
    expect(result).toMatchObject({
      complete: false,
      failure: "An item could not be stored this cycle.",
      counts: { inserted: 1, updated: 1, failed: 1 },
    });
    const [, end] = released();
    expect(end).toMatchObject({ succeeded: false, heartbeat: false });
    // A finished-but-dirty cycle is not resumed; the next daily start redoes it.
    expect(end.cursor).toEqual({ failures: 0 });
    expect(console.error).toHaveBeenCalledWith(
      "hackathons_devpost_item_failed",
      expect.objectContaining({ devpostId: 2, message: "constraint" }),
    );
  });

  it("remembers a failed item across runs so the cycle still ends dirty", async () => {
    const pages = Array.from({ length: 30 }, (_, i) => page([i + 1], 100));
    store.upsertDevpostHackathon.mockRejectedValueOnce(new Error("boom"));
    await run(true, pages).done;
    const cursor = released()[1].cursor;
    expect(cursor).toMatchObject({ dirty: true, page: MAX_PAGES_PER_RUN + 1 });
    const resumed = await run(false, [page([40], 40)], {
      cursor: { ...cursor, seen: Array.from({ length: 39 }, (_, i) => i + 1) },
    }).done;
    expect(resumed.complete).toBe(false);
    expect(released()[1]).toMatchObject({ succeeded: false, heartbeat: false });
  });

  it("releases with the error and never throws when storage fails on claim", async () => {
    store.claimJob.mockRejectedValue(new Error("connection refused"));
    const result = await runDevpostSync(true, {
      fetchPage: vi.fn(),
      sleep: async () => undefined,
    });
    expect(result).toMatchObject({
      ran: false,
      failure: "Devpost sync storage failed",
    });
    expect(store.releaseJob).not.toHaveBeenCalled();
  });

  it("releases the lease with the error when storage fails mid-cycle", async () => {
    store.claimJob.mockResolvedValue({
      leaseToken: "t",
      cursor: { page: 1, failures: 1 },
    });
    const result = await runDevpostSync(true, {
      fetchPage: async () => {
        throw new Error("pool closed");
      },
      sleep: async () => undefined,
    });
    expect(result.failure).toBe("Devpost sync storage failed");
    const [token, end] = released();
    expect(token).toBe("t");
    expect(end).toMatchObject({ succeeded: false, heartbeat: false });
    expect(end.cursor.failures).toBe(2);
    expect(end.retryAt.getTime()).toBe(NOW.getTime() + backoffMs(2));
  });

  it("does not throw even if releasing the lease fails too", async () => {
    store.releaseJob.mockRejectedValue(new Error("down"));
    store.claimJob.mockResolvedValue({ leaseToken: "t", cursor: { page: 1 } });
    await expect(
      runDevpostSync(true, {
        fetchPage: async () => page([1], 1),
        sleep: async () => undefined,
      }),
    ).resolves.toMatchObject({ failure: "Devpost sync storage failed" });
  });
});
