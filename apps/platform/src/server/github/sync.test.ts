// @vitest-environment node
/* eslint-disable @typescript-eslint/unbound-method -- asserting on vi.fn() members of a dependency object */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubClient, newBudget } from "./client";
import { hydrateStats, refreshRepo, runCommitSync, syncRepo } from "./sync";
import * as store from "./store";
import { db } from "~/server/db";

vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("./store");

const SHA = "a".repeat(40);
const MEMBER = "d2820000-0000-4000-a000-000000000001";
const repo = {
  id: 123,
  private: false,
  name: "repo",
  owner: { id: 1, login: "owner", type: "User" },
  default_branch: "main",
};
const scan = {
  githubRepoId: "123",
  leaseToken: "lease",
  scanHeadSha: null,
  scanSince: null,
  scanPage: 1,
  mode: "incremental" as const,
  lastSucceededAt: null,
  lastFullScanAt: null,
};
const request = {
  userId: MEMBER,
  githubId: "583231",
  requestedAt: "2026-10-31 00:00:00.123456+00",
  leaseToken: "request-lease",
};
const scopeRepo = {
  id: "123",
  owner: "owner",
  name: "repo",
  defaultBranch: "main",
};
const success = (data: unknown, next = false) => ({
  ok: true as const,
  data,
  next,
});
type Kind = "auth" | "rate" | "unavailable" | "retry" | "branch" | "budget";
const failure = (kind: Kind) => ({
  ok: false as const,
  kind,
  message: kind,
  retryAt: new Date(Date.now() + 60_000),
});
function api(values: unknown[]) {
  const client = new GithubClient({ appId: "", privateKey: "" });
  const call = vi.spyOn(client, "githubFetch");
  for (const v of values)
    call.mockResolvedValueOnce(
      v as Awaited<ReturnType<typeof client.githubFetch>>,
    );
  return client;
}
const paths = (client: GithubClient) =>
  vi.mocked(client.githubFetch).mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(store.claimRepo).mockResolvedValue(scan);
  vi.mocked(store.saveCommitPage).mockResolvedValue(true);
  vi.mocked(store.releaseRepo).mockResolvedValue(true);
  vi.mocked(store.releaseJob).mockResolvedValue(true);
  vi.mocked(store.completeBackfill).mockResolvedValue(true);
  vi.mocked(store.saveBackfillPage).mockResolvedValue(true);
  vi.mocked(store.scopeRepos).mockResolvedValue([]);
  vi.mocked(store.interruptedRepoIds).mockResolvedValue([]);
  vi.mocked(store.pendingStats).mockResolvedValue([]);
  vi.mocked(db.execute).mockResolvedValue([scan] as never);
});

describe("resumable default-branch listing", () => {
  it("pins initial backfill without since, stores provenance before completion", async () => {
    const client = api([
      success(repo),
      success([{ sha: SHA }]),
      success([{ sha: SHA }], true),
      success([]),
    ]);
    expect(await syncRepo("123", client, newBudget())).toMatchObject({
      data: "complete",
    });
    expect(store.checkpoint).toHaveBeenCalledWith(
      "123",
      "lease",
      SHA,
      null,
      true,
    );
    expect(paths(client)[2]).toContain(`sha=${SHA}&per_page=100&page=1`);
    expect(paths(client)[2]).not.toContain("since=");
    expect(paths(client)[3]).toContain("page=2");
    expect(store.saveCommitPage).toHaveBeenCalledTimes(2);
    expect(store.releaseRepo).toHaveBeenLastCalledWith("123", "lease", true);
  });

  it("overlaps incremental listing by seven days", async () => {
    const current = {
      ...scan,
      lastSucceededAt: new Date(),
      lastFullScanAt: new Date(),
    };
    vi.mocked(db.execute).mockResolvedValue([current] as never);
    const client = api([success(repo), success([{ sha: SHA }]), success([])]);
    await syncRepo("123", client, newBudget());
    expect(store.checkpoint).toHaveBeenCalledWith(
      "123",
      "lease",
      SHA,
      new Date(current.lastSucceededAt.getTime() - 7 * 86400000),
      false,
    );
  });

  it("weekly reconciliation enumerates old-dated merges without since", async () => {
    const current = {
      ...scan,
      lastSucceededAt: new Date(),
      lastFullScanAt: new Date(Date.now() - 8 * 86400000),
    };
    vi.mocked(db.execute).mockResolvedValue([current] as never);
    await syncRepo(
      "123",
      api([success(repo), success([{ sha: SHA }]), success([])]),
      newBudget(),
    );
    expect(store.checkpoint).toHaveBeenCalledWith(
      "123",
      "lease",
      SHA,
      null,
      true,
    );
  });

  it("a requested full scan ignores the overlap window", async () => {
    const current = {
      ...scan,
      lastSucceededAt: new Date(),
      lastFullScanAt: new Date(),
    };
    vi.mocked(db.execute).mockResolvedValue([current] as never);
    await syncRepo(
      "123",
      api([success(repo), success([{ sha: SHA }]), success([])]),
      newBudget(),
      true,
    );
    expect(store.checkpoint).toHaveBeenCalledWith(
      "123",
      "lease",
      SHA,
      null,
      true,
    );
  });

  it("resumes the persisted head and page without repinning", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      { ...scan, scanHeadSha: SHA, scanPage: 9, mode: "full" },
    ] as never);
    const client = api([success(repo), success([])]);
    await syncRepo("123", client, newBudget());
    expect(client.githubFetch).toHaveBeenLastCalledWith(
      expect.stringContaining(`sha=${SHA}&per_page=100&page=9`),
      expect.anything(),
    );
    expect(store.checkpoint).not.toHaveBeenCalled();
  });

  it("does nothing, and does not touch GitHub, while another worker holds the repo", async () => {
    vi.mocked(store.claimRepo).mockResolvedValue(undefined);
    const client = api([]);
    expect(await syncRepo("123", client, newBudget())).toMatchObject({
      data: "cached",
    });
    expect(client.githubFetch).not.toHaveBeenCalled();
  });

  it("budget release preserves the cursor and never declares listing success", async () => {
    const client = api([success(repo), success([{ sha: SHA }])]);
    expect(
      await syncRepo("123", client, {
        requests: 65,
        deadline: Date.now() + 45000,
      }),
    ).toMatchObject({ data: "queued" });
    expect(store.releaseRepo).toHaveBeenLastCalledWith("123", "lease", false);
  });

  it("a lost lease stops without completing", async () => {
    vi.mocked(store.saveCommitPage).mockResolvedValue(false);
    const client = api([success(repo), success([{ sha: SHA }]), success([])]);
    expect(await syncRepo("123", client, newBudget())).toMatchObject({
      data: "queued",
    });
    expect(store.releaseRepo).not.toHaveBeenCalled();
  });

  it("an empty repository is available and complete", async () => {
    const empty = {
      ok: false as const,
      kind: "empty" as const,
      message: "empty",
      retryAt: new Date(),
    };
    expect(
      await syncRepo("123", api([success(repo), empty]), newBudget()),
    ).toMatchObject({ data: "complete" });
    expect(store.markUnavailable).not.toHaveBeenCalled();
    expect(store.releaseRepo).toHaveBeenLastCalledWith(
      "123",
      "lease",
      true,
      null,
      expect.any(Date),
    );
  });

  it("a stale branch restarts from a fresh head instead of failing the repo", async () => {
    expect(
      await syncRepo(
        "123",
        api([success(repo), success([{ sha: SHA }]), failure("branch")]),
        newBudget(),
      ),
    ).toMatchObject({ kind: "branch" });
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(store.releaseRepo).toHaveBeenCalledWith(
      "123",
      "lease",
      false,
      "branch",
      expect.any(Date),
    );
  });
});

describe("repo health", () => {
  it("auth and transient failures preserve health; private becomes unavailable", async () => {
    await refreshRepo("123", api([failure("auth")]), newBudget());
    expect(store.markUnavailable).not.toHaveBeenCalled();
    await refreshRepo("123", api([failure("retry")]), newBudget());
    expect(store.markUnavailable).not.toHaveBeenCalled();
    vi.mocked(db.execute).mockResolvedValue([] as never);
    await refreshRepo(
      "123",
      api([success({ ...repo, private: true })]),
      newBudget(),
    );
    expect(store.markUnavailable).toHaveBeenCalledWith("123");
    expect(store.saveRepo).not.toHaveBeenCalled();
  });

  it("a 404 retries the cached name and trusts it only when the id agrees", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      { owner: "old", name: "name" },
    ] as never);
    // The name now belongs to another repo: the old identity is unavailable
    // and the other repo's cache is never touched.
    const reused = api([failure("unavailable"), success({ ...repo, id: 999 })]);
    expect(await refreshRepo("123", reused, newBudget())).toMatchObject({
      ok: false,
      kind: "unavailable",
    });
    expect(store.markUnavailable).toHaveBeenCalledWith("123");
    expect(store.saveRepo).not.toHaveBeenCalled();
    vi.mocked(store.markUnavailable).mockClear();
    const renamed = api([failure("unavailable"), success(repo)]);
    expect(await refreshRepo("123", renamed, newBudget())).toMatchObject({
      ok: true,
    });
    expect(store.saveRepo).toHaveBeenCalledWith(repo);
  });

  it("a rename or transfer only updates the cache; nothing is deleted", async () => {
    await refreshRepo("123", api([success(repo)]), newBudget());
    expect(store.saveRepo).toHaveBeenCalledWith(repo);
    expect(store.markUnavailable).not.toHaveBeenCalled();
  });
});

describe("independent size hydration", () => {
  const pending = { sha: SHA, owner: "o", name: "r" };
  const stats = { additions: 20, deletions: 10 };

  it("counts unique files over detail pages without summing repeated stats", async () => {
    vi.mocked(store.pendingStats).mockResolvedValue([pending]);
    const client = api([
      success({ stats, files: [{ filename: "a" }] }, true),
      success({ stats, files: [{ filename: "a" }, { filename: "b" }] }),
    ]);
    expect(await hydrateStats(client, newBudget())).toMatchObject({ ok: true });
    expect(store.saveStats).toHaveBeenCalledWith(SHA, {
      state: "complete",
      files: 2,
      additions: 20,
      deletions: 10,
    });
  });

  it("marks a commit truncated at GitHub's file cap and keeps no file count", async () => {
    vi.mocked(store.pendingStats).mockResolvedValue([pending]);
    const client = api(
      Array.from({ length: 30 }, (_, page) =>
        success(
          {
            stats,
            files: Array.from({ length: 100 }, (_, i) => ({
              filename: `f${page}-${i}`,
            })),
          },
          true,
        ),
      ),
    );
    await hydrateStats(client, newBudget());
    expect(store.saveStats).toHaveBeenCalledWith(SHA, {
      state: "truncated",
      files: null,
      additions: 20,
      deletions: 10,
    });
  });

  it("settles a commit that can no longer be read as unavailable", async () => {
    vi.mocked(store.pendingStats).mockResolvedValue([pending]);
    await hydrateStats(api([failure("unavailable")]), newBudget());
    expect(store.saveStats).toHaveBeenCalledWith(SHA, { state: "unavailable" });
  });

  it("leaves a transiently failing commit pending and carries on to the next", async () => {
    vi.mocked(store.pendingStats).mockResolvedValue([
      pending,
      { ...pending, sha: "b".repeat(40) },
    ]);
    const client = api([
      failure("retry"),
      success({ stats, files: [{ filename: "a" }] }),
    ]);
    await hydrateStats(client, newBudget());
    expect(store.saveStats).toHaveBeenCalledTimes(1);
    expect(store.saveStats).toHaveBeenCalledWith(
      "b".repeat(40),
      expect.objectContaining({ state: "complete" }),
    );
  });

  it.each(["auth", "rate", "budget"] as const)(
    "a %s failure ends the run",
    async (kind) => {
      vi.mocked(store.pendingStats).mockResolvedValue([
        pending,
        { ...pending, sha: "b".repeat(40) },
      ]);
      const client = api([failure(kind)]);
      expect(await hydrateStats(client, newBudget())).toMatchObject({
        ok: false,
        kind,
      });
      expect(client.githubFetch).toHaveBeenCalledTimes(1);
      expect(store.saveStats).not.toHaveBeenCalled();
    },
  );
});

describe("the sweep", () => {
  it("takes no work without a lease on the job, but still hydrates sizes", async () => {
    vi.mocked(store.claimJob).mockResolvedValue(undefined);
    const run = await runCommitSync(false, api([]));
    expect(run).toMatchObject({ success: true, complete: false });
    expect(store.releaseJob).not.toHaveBeenCalled();
    expect(store.pendingStats).toHaveBeenCalled();
  });

  it("completes a clean daily cycle and records the heartbeat with the release", async () => {
    vi.mocked(store.claimJob).mockResolvedValue({
      leaseToken: "job",
      cursor: { phase: "repos", sweep: true, after: "0" },
    });
    vi.mocked(store.scopeRepos).mockResolvedValueOnce([]);
    vi.mocked(store.claimBackfill).mockResolvedValue(undefined);
    const run = await runCommitSync(true, api([]));
    expect(run).toMatchObject({ success: true, complete: true });
    expect(store.releaseJob).toHaveBeenCalledWith(
      "job",
      expect.objectContaining({ phase: "backfill" }),
      true,
      true,
      null,
      undefined,
    );
  });

  it("does not report the heartbeat for a backfill-only run", async () => {
    vi.mocked(store.claimJob).mockResolvedValue({
      leaseToken: "job",
      cursor: { phase: "backfill" },
    });
    vi.mocked(store.claimBackfill).mockResolvedValue(undefined);
    await runCommitSync(false, api([]));
    expect(vi.mocked(store.releaseJob).mock.calls[0]![2]).toBe(true);
    expect(vi.mocked(store.releaseJob).mock.calls[0]![3]).toBe(false);
  });

  it("a transient repo failure skips the repo and withholds the heartbeat", async () => {
    vi.mocked(store.claimJob).mockResolvedValue({
      leaseToken: "job",
      cursor: { phase: "repos", sweep: true, after: "0" },
    });
    vi.mocked(store.scopeRepos).mockResolvedValueOnce([scopeRepo]);
    vi.mocked(store.claimBackfill).mockResolvedValue(undefined);
    const run = await runCommitSync(
      true,
      api([failure("retry"), failure("retry")]),
    );
    expect(run).toMatchObject({ success: true, complete: true });
    const [, cursor, complete, heartbeat, error] = vi.mocked(store.releaseJob)
      .mock.calls[0]!;
    expect(cursor).toMatchObject({ dirty: true, phase: "backfill" });
    expect([complete, heartbeat]).toEqual([true, false]);
    expect(error).toMatch(/failed transiently/);
  });

  it("an unavailable repo counts as processed and keeps the cycle clean", async () => {
    vi.mocked(store.claimJob).mockResolvedValue({
      leaseToken: "job",
      cursor: { phase: "repos", sweep: true, after: "0" },
    });
    vi.mocked(store.scopeRepos).mockResolvedValueOnce([scopeRepo]);
    vi.mocked(store.claimBackfill).mockResolvedValue(undefined);
    vi.mocked(db.execute).mockResolvedValue([] as never);
    await runCommitSync(
      true,
      api([failure("unavailable"), failure("unavailable")]),
    );
    expect(vi.mocked(store.releaseJob).mock.calls[0]![3]).toBe(true);
    expect(store.markUnavailable).toHaveBeenCalledWith("123");
  });

  it("an auth failure fails the run without marking any repo unavailable", async () => {
    vi.mocked(store.claimJob).mockResolvedValue({
      leaseToken: "job",
      cursor: { phase: "repos", sweep: true, after: "0" },
    });
    vi.mocked(store.scopeRepos).mockResolvedValueOnce([scopeRepo]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = await runCommitSync(true, api([failure("auth")]));
    expect(run).toMatchObject({
      success: false,
      complete: false,
      failure: "auth",
    });
    expect(store.markUnavailable).not.toHaveBeenCalled();
    expect(vi.mocked(store.releaseJob).mock.calls[0]![2]).toBe(false);
  });

  it("a rate limit defers to the reset and still counts as a healthy run", async () => {
    vi.mocked(store.claimJob).mockResolvedValue({
      leaseToken: "job",
      cursor: { phase: "repos", sweep: true, after: "0" },
    });
    vi.mocked(store.scopeRepos).mockResolvedValueOnce([scopeRepo]);
    const limited = failure("rate");
    const run = await runCommitSync(true, api([limited]));
    expect(run).toMatchObject({ success: true, complete: false });
    expect(vi.mocked(store.releaseJob).mock.calls[0]![5]).toBe(limited.retryAt);
  });

  it("resumes an interrupted repo scan outside a cycle", async () => {
    vi.mocked(store.claimJob).mockResolvedValue(undefined);
    vi.mocked(store.interruptedRepoIds).mockResolvedValue(["123"]);
    const client = api([success(repo), success([])]);
    await runCommitSync(false, client);
    expect(store.claimRepo).toHaveBeenCalledWith("123");
    expect(paths(client)[0]).toBe("/repositories/123");
  });
});

describe("member backfill", () => {
  const job = (cursor = {}) =>
    vi.mocked(store.claimJob).mockResolvedValue({
      leaseToken: "job",
      cursor: { phase: "backfill", ...cursor },
    });

  it("walks every in-scope repo's default branch by the member's current login, then completes", async () => {
    job();
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValue(undefined);
    vi.mocked(store.scopeRepos).mockResolvedValueOnce([
      scopeRepo,
      { ...scopeRepo, id: "456", owner: "other", name: "second" },
    ]);
    const client = api([
      success({ id: 583231, login: "current login" }),
      success([{ sha: SHA }], true),
      success([{ sha: SHA }]),
      success([{ sha: "b".repeat(40) }]),
    ]);
    await runCommitSync(false, client);
    expect(paths(client).slice(0, 4)).toEqual([
      "/user/583231",
      "/repos/owner/repo/commits?sha=main&author=current%20login&per_page=100&page=1",
      "/repos/owner/repo/commits?sha=main&author=current%20login&per_page=100&page=2",
      "/repos/other/second/commits?sha=main&author=current%20login&per_page=100&page=1",
    ]);
    // Full history: no `since`, and no pinned head.
    expect(paths(client).join()).not.toContain("since=");
    expect(store.saveBackfillPage).toHaveBeenCalledTimes(3);
    expect(store.saveBackfillPage).toHaveBeenCalledWith(
      request,
      "456",
      "main",
      expect.any(Array),
    );
    expect(store.completeBackfill).toHaveBeenCalledWith(request);
    expect(store.failBackfill).not.toHaveBeenCalled();
  });

  it("drains several requests oldest first within one invocation", async () => {
    job();
    const second = { ...request, userId: "u2", githubId: "2" };
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(second)
      .mockResolvedValue(undefined);
    vi.mocked(store.scopeRepos).mockResolvedValue([]);
    const client = api([
      success({ id: 583231, login: "a" }),
      success({ id: 2, login: "b" }),
    ]);
    await runCommitSync(false, client);
    expect(store.completeBackfill).toHaveBeenCalledWith(request);
    expect(store.completeBackfill).toHaveBeenCalledWith(second);
  });

  it("respects a lease held elsewhere: nothing is claimed, fetched or completed", async () => {
    job();
    vi.mocked(store.claimBackfill).mockResolvedValue(undefined);
    const client = api([]);
    await runCommitSync(false, client);
    expect(client.githubFetch).not.toHaveBeenCalled();
    expect(store.completeBackfill).not.toHaveBeenCalled();
  });

  it("does not complete a request whose lease was lost mid-walk", async () => {
    job();
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValue(undefined);
    vi.mocked(store.scopeRepos).mockResolvedValue([scopeRepo]);
    vi.mocked(store.saveBackfillPage).mockResolvedValue(false);
    const client = api([
      success({ id: 583231, login: "a" }),
      success([{ sha: SHA }]),
    ]);
    await runCommitSync(false, client);
    expect(store.completeBackfill).not.toHaveBeenCalled();
    expect(store.releaseBackfill).toHaveBeenCalledWith(request);
  });

  it("releases the lease after a refused completion so a re-request is picked up", async () => {
    job();
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValue(undefined);
    vi.mocked(store.completeBackfill).mockResolvedValue(false);
    await runCommitSync(false, api([success({ id: 583231, login: "a" })]));
    expect(store.releaseBackfill).toHaveBeenCalledWith(request);
  });

  it("resumes a persisted cursor at the repo and page it stopped on", async () => {
    job({
      backfill: {
        user: MEMBER,
        githubId: "583231",
        after: "100",
        repo: "123",
        page: 4,
      },
    });
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValue(undefined);
    vi.mocked(store.scopeRepos).mockResolvedValueOnce([scopeRepo]);
    const client = api([
      success({ id: 583231, login: "a" }),
      success([{ sha: SHA }]),
    ]);
    await runCommitSync(false, client);
    expect(store.scopeRepos).toHaveBeenCalledWith("100", expect.any(Number));
    expect(paths(client)[1]).toContain("page=4");
  });

  it("starts over when the cursor belongs to another member", async () => {
    job({
      backfill: {
        user: "someone-else",
        githubId: "1",
        after: "999",
        repo: "123",
        page: 4,
      },
    });
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValue(undefined);
    vi.mocked(store.scopeRepos).mockResolvedValueOnce([scopeRepo]);
    await runCommitSync(
      false,
      api([success({ id: 583231, login: "a" }), success([])]),
    );
    expect(store.scopeRepos).toHaveBeenCalledWith("0", expect.any(Number));
  });

  it("saves its place and gives the lease back when the budget runs out", async () => {
    job();
    vi.mocked(store.claimBackfill).mockResolvedValue(request);
    vi.mocked(store.scopeRepos).mockResolvedValue([scopeRepo]);
    const client = api([]);
    const spy = vi.mocked(client.githubFetch);
    spy.mockImplementationOnce(() =>
      Promise.resolve(success({ id: 583231, login: "a" })),
    );
    // The first page spends the rest of the work budget, ending the walk.
    spy.mockImplementationOnce((_path, budget) => {
      budget.requests = 65;
      return Promise.resolve(success([{ sha: SHA }], true));
    });
    const run = await runCommitSync(false, client);
    expect(run).toMatchObject({ complete: false, success: true });
    expect(store.completeBackfill).not.toHaveBeenCalled();
    expect(store.failBackfill).not.toHaveBeenCalled();
    expect(store.releaseBackfill).toHaveBeenCalledWith(request);
    expect(vi.mocked(store.releaseJob).mock.calls[0]![1]).toMatchObject({
      backfill: { user: MEMBER, after: "0", repo: "123", page: 2 },
    });
  });

  it("a rate limit gives the lease back without counting an attempt", async () => {
    job();
    vi.mocked(store.claimBackfill).mockResolvedValue(request);
    const run = await runCommitSync(false, api([failure("rate")]));
    expect(run).toMatchObject({ success: true, complete: false });
    expect(store.releaseBackfill).toHaveBeenCalledWith(request);
    expect(store.failBackfill).not.toHaveBeenCalled();
  });

  it("a transient failure counts an attempt, backs that member off and carries on", async () => {
    job();
    const second = { ...request, userId: "u2", githubId: "2" };
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(second)
      .mockResolvedValue(undefined);
    vi.mocked(store.scopeRepos).mockResolvedValue([]);
    await runCommitSync(
      false,
      api([failure("retry"), success({ id: 2, login: "b" })]),
    );
    expect(store.failBackfill).toHaveBeenCalledWith(request, "retry");
    expect(store.completeBackfill).toHaveBeenCalledWith(second);
  });

  it("an auth failure fails the run and leaves the request retryable", async () => {
    job();
    vi.mocked(store.claimBackfill).mockResolvedValue(request);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = await runCommitSync(false, api([failure("auth")]));
    expect(run).toMatchObject({ success: false, failure: "auth" });
    expect(store.failBackfill).not.toHaveBeenCalled();
    expect(store.releaseBackfill).toHaveBeenCalledWith(request);
  });

  it("completes a member whose GitHub account no longer exists, storing nothing", async () => {
    job();
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValue(undefined);
    await runCommitSync(false, api([failure("unavailable")]));
    expect(store.completeBackfill).toHaveBeenCalledWith(request);
    expect(store.saveBackfillPage).not.toHaveBeenCalled();
  });

  it("skips repos that went private or are empty, and walks the rest", async () => {
    job();
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValue(undefined);
    vi.mocked(store.scopeRepos).mockResolvedValueOnce([
      scopeRepo,
      { ...scopeRepo, id: "456", name: "next" },
      { ...scopeRepo, id: "789", name: "unborn", defaultBranch: null },
    ]);
    const client = api([
      success({ id: 583231, login: "a" }),
      failure("unavailable"),
      success([{ sha: SHA }]),
    ]);
    await runCommitSync(false, client);
    expect(store.markUnavailable).toHaveBeenCalledWith("123");
    expect(store.saveBackfillPage).toHaveBeenCalledTimes(1);
    expect(client.githubFetch).toHaveBeenCalledTimes(3);
    expect(store.completeBackfill).toHaveBeenCalledWith(request);
  });

  it("runs after the sweep inside a daily cycle, which then reports success", async () => {
    vi.mocked(store.claimJob).mockResolvedValue({
      leaseToken: "job",
      cursor: { phase: "repos", sweep: true, after: "0" },
    });
    vi.mocked(store.claimBackfill)
      .mockResolvedValueOnce(request)
      .mockResolvedValue(undefined);
    vi.mocked(store.scopeRepos).mockResolvedValue([]);
    await runCommitSync(true, api([success({ id: 583231, login: "a" })]));
    expect(store.completeBackfill).toHaveBeenCalledWith(request);
    expect(vi.mocked(store.releaseJob).mock.calls[0]!.slice(2, 4)).toEqual([
      true,
      true,
    ]);
  });
});
