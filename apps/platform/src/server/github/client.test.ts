// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubClient, hasRoom, newBudget } from "./client";
vi.mock("../config/githubApp", () => ({
  appJwt: vi.fn(() => Promise.resolve("app-jwt")),
}));
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(data), { status, headers });
const setup = () => {
  const fetcher = vi.fn<typeof fetch>();
  fetcher.mockResolvedValueOnce(json({ id: 123 })).mockResolvedValueOnce(
    json({
      token: "installation-token",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    }),
  );
  return {
    fetcher,
    api: new GithubClient(
      { appId: "read-app", privateKey: "test-key" },
      fetcher,
    ),
  };
};
beforeEach(() => vi.clearAllMocks());
describe("one authenticated transport", () => {
  it("exchanges the App JWT for read-only org permissions and caches it", async () => {
    const { fetcher, api } = setup();
    fetcher.mockResolvedValue(json({ id: 1 }));
    const budget = newBudget();
    await api.githubFetch("/repositories/1", budget);
    await api.githubFetch("/repositories/2", budget);
    expect(budget.requests).toBe(4);
    expect(fetcher.mock.calls[0]![0]).toBe(
      "https://api.github.com/orgs/DevDogsUGA/installation",
    );
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual({
      permissions: { metadata: "read" },
    });
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.headers).toMatchObject({
        "x-github-api-version": "2022-11-28",
      });
      expect((init?.headers as Record<string, string>).authorization).toMatch(
        /^Bearer /,
      );
    }
    expect(fetcher.mock.calls[3]![1]?.headers).toMatchObject({
      authorization: "Bearer installation-token",
    });
  });
  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "unavailable"],
    [451, "unavailable"],
    [409, "empty"],
    [422, "branch"],
    [500, "retry"],
    [429, "rate"],
  ])("classifies %s as %s", async (status, kind) => {
    const { fetcher, api } = setup();
    fetcher.mockResolvedValue(json({}, Number(status)));
    expect(await api.githubFetch("/repositories/1", newBudget())).toMatchObject(
      { ok: false, kind },
    );
  });
  it("keeps twenty percent headroom without losing the successful page", async () => {
    const { fetcher, api } = setup();
    fetcher.mockResolvedValue(
      json([], 200, {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "1000",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      }),
    );
    const budget = newBudget();
    expect(await api.githubFetch("/repositories/1", budget)).toMatchObject({
      ok: true,
    });
    expect(await api.githubFetch("/repositories/2", budget)).toMatchObject({
      kind: "rate",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("honors Retry-After and secondary throttles", async () => {
    const { fetcher, api } = setup();
    fetcher.mockResolvedValue(
      json({ message: "secondary rate limit" }, 403, { "retry-after": "120" }),
    );
    const result = await api.githubFetch("/repositories/1", newBudget());
    expect(result).toMatchObject({ kind: "rate" });
    if (!result.ok)
      expect(result.retryAt.getTime()).toBeGreaterThanOrEqual(
        Date.now() + 119_000,
      );
  });
  it("classifies missing installation as an auth outage", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({}, 404));
    const api = new GithubClient({ appId: "a", privateKey: "k" }, f);
    expect(await api.githubFetch("/repositories/1", newBudget())).toMatchObject(
      { kind: "auth" },
    );
  });
  it("does not fetch beyond 100 requests or the deadline", async () => {
    const { fetcher, api } = setup();
    expect(
      await api.githubFetch(
        "/repositories/1",
        { requests: 100, deadline: Date.now() + 45000 },
        "token",
      ),
    ).toMatchObject({ kind: "budget" });
    expect(
      await api.githubFetch(
        "/repositories/1",
        { requests: 0, deadline: 0 },
        "token",
      ),
    ).toMatchObject({ kind: "budget" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("leaves the last stretch of the budget to size hydration", () => {
    expect(hasRoom({ requests: 64, deadline: Date.now() + 45_000 })).toBe(true);
    expect(hasRoom({ requests: 65, deadline: Date.now() + 45_000 })).toBe(
      false,
    );
    expect(hasRoom({ requests: 0, deadline: Date.now() + 14_000 })).toBe(false);
  });
  it("never sends a request without the installation token", async () => {
    const f = vi.fn<typeof fetch>();
    const api = new GithubClient({ appId: "", privateKey: "" }, f);
    expect(await api.githubFetch("/repositories/1", newBudget())).toMatchObject(
      { ok: false, kind: "auth" },
    );
    expect(f).not.toHaveBeenCalled();
  });
  it("preserves health on network failures", async () => {
    const { fetcher, api } = setup();
    fetcher.mockRejectedValue(new Error("timeout"));
    expect(await api.githubFetch("/repositories/1", newBudget())).toMatchObject(
      { kind: "retry" },
    );
  });
});
