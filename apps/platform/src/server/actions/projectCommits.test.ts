// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { refreshProjectCommitsAction } from "./projectCommits";
import { authorizeSession } from "~/server/auth/access";
import { requestCommitRefresh } from "~/server/github/refresh";

vi.mock("~/server/auth/access", () => ({ authorizeSession: vi.fn() }));
vi.mock("~/server/github/refresh", () => ({ requestCommitRefresh: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

it("authorizes the session before any record rule, rate limit or sync", async () => {
  vi.mocked(authorizeSession).mockResolvedValue({
    ok: false,
    message: "Session expected but not found.",
  });
  expect(await refreshProjectCommitsAction("p", "1")).toEqual({
    ok: false,
    message: "Session expected but not found.",
  });
  expect(requestCommitRefresh).not.toHaveBeenCalled();
});

it("hands the Caller to the record rule once signed in", async () => {
  const caller = { userId: "u", isLeader: false };
  vi.mocked(authorizeSession).mockResolvedValue({
    ok: true,
    caller,
  } as never);
  vi.mocked(requestCommitRefresh).mockResolvedValue({
    ok: true,
    data: { status: "queued", lastSyncedAt: null },
  });
  await refreshProjectCommitsAction("p", "1");
  expect(requestCommitRefresh).toHaveBeenCalledWith(caller, "p", "1");
});
