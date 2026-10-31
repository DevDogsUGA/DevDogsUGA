// @vitest-environment node
/* eslint-disable @typescript-eslint/unbound-method -- asserting on vi.fn() members of a dependency object */
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestCommitRefresh } from "./refresh";
import type { Caller } from "~/server/auth/access";
import { consumeRateLimit } from "~/server/rateLimit";
import { db } from "~/server/db";
import { syncRepo } from "./sync";

vi.mock("~/server/rateLimit", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("~/server/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("./sync", () => ({ githubClient: vi.fn(), syncRepo: vi.fn() }));

const PROJECT = "d2820000-0000-4000-a000-000000000001";
const caller = (isLeader = false) =>
  ({ userId: PROJECT, isLeader }) as unknown as Caller;
beforeEach(() => vi.resetAllMocks());

describe("on-demand commit refresh", () => {
  it("rejects malformed ids before any query", async () => {
    expect(await requestCommitRefresh(caller(), "nope", "123")).toMatchObject({
      ok: false,
    });
    expect(await requestCommitRefresh(caller(), PROJECT, "0")).toMatchObject({
      ok: false,
    });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("denies callers who are not owner, contributor or officer before spending a rate hit", async () => {
    vi.mocked(db.execute).mockResolvedValue([] as never);
    expect(await requestCommitRefresh(caller(), PROJECT, "123")).toMatchObject({
      ok: false,
    });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(syncRepo).not.toHaveBeenCalled();
  });

  it("applies the record rule to an approved link of that Project only", async () => {
    vi.mocked(db.execute).mockResolvedValue([] as never);
    await requestCommitRefresh(caller(true), PROJECT, "123");
    const text = new PgDialect().sqlToQuery(
      vi.mocked(db.execute).mock.calls[0]![0] as SQL,
    ).sql;
    expect(text).toContain(`pr.approval = 'approved'`);
    expect(text).toContain(`platform."projectOwners"`);
    expect(text).toContain('c."userId"');
  });

  it("rate limits per user and repo, and answers a limited caller without upstream work", async () => {
    vi.mocked(db.execute).mockResolvedValue([{}] as never);
    vi.mocked(consumeRateLimit).mockResolvedValue(false);
    expect(await requestCommitRefresh(caller(), PROJECT, "123")).toMatchObject({
      ok: false,
      message: "Try again later.",
    });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      scope: "project-commits:123",
      subjectId: PROJECT,
      limit: 3,
      windowSeconds: 3600,
    });
    expect(syncRepo).not.toHaveBeenCalled();
  });

  it("runs a full scan through the shared lease and returns the last sync time", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{}] as never)
      .mockResolvedValueOnce([
        { lastSucceededAt: new Date("2026-10-31T00:00:00Z") },
      ] as never);
    vi.mocked(consumeRateLimit).mockResolvedValue(true);
    vi.mocked(syncRepo).mockResolvedValue({
      ok: true,
      data: "complete",
      next: false,
    });
    expect(await requestCommitRefresh(caller(), PROJECT, "123")).toMatchObject({
      ok: true,
      data: { status: "cached", lastSyncedAt: "2026-10-31T00:00:00.000Z" },
    });
    // fullRequested, with a smaller budget than a cron invocation.
    const [id, , budget, full] = vi.mocked(syncRepo).mock.calls[0]!;
    expect([id, full]).toEqual(["123", true]);
    expect(budget.deadline - Date.now()).toBeLessThanOrEqual(20_000);
  });

  it("reports queued when the scan did not finish within the request's budget", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{}] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(consumeRateLimit).mockResolvedValue(true);
    vi.mocked(syncRepo).mockResolvedValue({
      ok: true,
      data: "queued",
      next: false,
    });
    expect(await requestCommitRefresh(caller(), PROJECT, "123")).toMatchObject({
      ok: true,
      data: { status: "queued", lastSyncedAt: null },
    });
  });

  it("answers cached when another worker holds the repo's lease", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{}] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(consumeRateLimit).mockResolvedValue(true);
    vi.mocked(syncRepo).mockResolvedValue({
      ok: true,
      data: "cached",
      next: false,
    });
    expect(await requestCommitRefresh(caller(), PROJECT, "123")).toMatchObject({
      ok: true,
      data: { status: "cached" },
    });
  });

  it("surfaces an authentication failure but not other GitHub failures", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{}] as never)
      .mockResolvedValue([] as never);
    vi.mocked(consumeRateLimit).mockResolvedValue(true);
    vi.mocked(syncRepo).mockResolvedValueOnce({
      ok: false,
      kind: "auth",
      message: "read App failed",
      retryAt: new Date(),
    });
    expect(await requestCommitRefresh(caller(), PROJECT, "123")).toEqual({
      ok: false,
      message: "read App failed",
    });
  });
});
