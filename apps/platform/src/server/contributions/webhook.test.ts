// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { signGithubBody, verifyGithubSignature } from "./signature";
import { parsePullRequestEvent, type MergedPullRequest } from "./pullRequest";
import { handleGithubWebhook } from "./webhook";

// The route's real collaborators reach the database; the handler takes both
// through `deps`, so the module-level imports are stubbed out.
vi.mock("~/env", () => ({
  env: { GH_WEBHOOK_SECRET: undefined, GITHUB_ORG: "DevDogsUGA" },
}));
vi.mock("./store", () => ({ recordContribution: vi.fn() }));

const SECRET = "test-webhook-secret-0123456789";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    action: "closed",
    pull_request: {
      number: 7,
      title: "Fix the thing",
      html_url: "https://github.com/DevDogsUGA/site/pull/7",
      merged: true,
      merged_at: "2026-10-14T15:00:00Z",
      user: { id: 12345, login: "octo", type: "User" },
    },
    repository: {
      full_name: "DevDogsUGA/site",
      private: false,
      owner: { login: "DevDogsUGA" },
    },
    ...overrides,
  };
}

function delivery(
  body: unknown,
  headers: Record<string, string | null> = {},
  secret = SECRET,
) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const merged: Record<string, string | null> = {
    "x-hub-signature-256": signGithubBody(secret, raw),
    "x-github-event": "pull_request",
    "x-github-delivery": "delivery-1",
    ...headers,
  };
  const h = new Headers();
  for (const [k, v] of Object.entries(merged)) if (v !== null) h.set(k, v);
  return new Request("https://example.test/github/webhook", {
    method: "POST",
    headers: h,
    body: raw,
  });
}

function setup() {
  const record = vi.fn<
    (
      pr: MergedPullRequest,
      id: string | null,
    ) => Promise<"recorded" | "duplicate">
  >(async () => "recorded");
  return {
    record,
    call: (request: Request, ...secret: [string | undefined] | []) =>
      handleGithubWebhook(request, {
        secret: secret.length ? secret[0] : SECRET,
        org: "DevDogsUGA",
        record,
      }),
  };
}

describe("verifyGithubSignature", () => {
  it("accepts the right signature", () => {
    expect(
      verifyGithubSignature(SECRET, "{}", signGithubBody(SECRET, "{}")),
    ).toBe(true);
  });
  it("rejects a wrong secret, a changed body, a missing or malformed header", () => {
    const good = signGithubBody(SECRET, "{}");
    expect(verifyGithubSignature("other-secret-other-secret", "{}", good)).toBe(
      false,
    );
    expect(verifyGithubSignature(SECRET, "{ }", good)).toBe(false);
    expect(verifyGithubSignature(SECRET, "{}", null)).toBe(false);
    expect(verifyGithubSignature(SECRET, "{}", "")).toBe(false);
    expect(verifyGithubSignature(SECRET, "{}", "sha256=abc")).toBe(false);
    expect(
      verifyGithubSignature(SECRET, "{}", good.replace("sha256=", "sha1=")),
    ).toBe(false);
  });
});

describe("POST /github/webhook", () => {
  it("answers 503 without a configured secret", async () => {
    const { call, record } = setup();
    const res = await call(delivery(payload()), undefined);
    expect(res.status).toBe(503);
    expect(record).not.toHaveBeenCalled();
  });

  it("answers 401 for an invalid or missing signature", async () => {
    const { call, record } = setup();
    const wrong = await call(
      delivery(payload(), {
        "x-hub-signature-256": "sha256=" + "0".repeat(64),
      }),
    );
    const missing = await call(
      delivery(payload(), { "x-hub-signature-256": null }),
    );
    const forged = await call(
      delivery(payload(), {}, "attacker-secret-attacker"),
    );
    expect([wrong.status, missing.status, forged.status]).toEqual([
      401, 401, 401,
    ]);
    expect(record).not.toHaveBeenCalled();
  });

  it("records a merged pull request", async () => {
    const { call, record } = setup();
    const res = await call(delivery(payload()));
    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledTimes(1);
    const [pr, deliveryId] = record.mock.calls[0]!;
    expect(deliveryId).toBe("delivery-1");
    expect(pr).toMatchObject({
      repo: "DevDogsUGA/site",
      number: 7,
      authorGithubId: "12345",
      authorLogin: "octo",
      repoPrivate: false,
    });
    expect(pr.mergedAt.toISOString()).toBe("2026-10-14T15:00:00.000Z");
  });

  it("ignores everything else with a 2xx", async () => {
    const { call, record } = setup();
    const closedUnmerged = payload();
    (closedUnmerged.pull_request as Record<string, unknown>).merged = false;
    (closedUnmerged.pull_request as Record<string, unknown>).merged_at = null;
    const cases = [
      delivery(payload({ action: "opened" })),
      delivery(closedUnmerged),
      delivery(payload(), { "x-github-event": "push" }),
      delivery(payload(), { "x-github-event": "ping" }),
      delivery("not json"),
      delivery(
        payload({
          repository: {
            full_name: "someone/else",
            owner: { login: "someone" },
          },
        }),
      ),
      delivery(
        payload({
          pull_request: {
            ...payload().pull_request,
            user: { id: 1, login: "renovate[bot]", type: "Bot" },
          },
        }),
      ),
    ];
    for (const request of cases) {
      const res = await call(request);
      expect(res.status).toBe(200);
    }
    expect(record).not.toHaveBeenCalled();
  });

  it("reports a redelivery as a duplicate without failing", async () => {
    const { call, record } = setup();
    record.mockResolvedValueOnce("recorded").mockResolvedValueOnce("duplicate");
    expect(await (await call(delivery(payload()))).json()).toEqual({
      recorded: true,
    });
    expect(await (await call(delivery(payload()))).json()).toEqual({
      duplicate: true,
    });
  });
});

describe("parsePullRequestEvent", () => {
  it("matches the organization case-insensitively and marks private repos", () => {
    const parsed = parsePullRequestEvent(
      payload({
        repository: {
          full_name: "devdogsuga/secret",
          private: true,
          owner: { login: "devdogsuga" },
        },
      }),
      "DevDogsUGA",
    );
    expect(parsed.kind).toBe("merged");
    if (parsed.kind === "merged")
      expect(parsed.pullRequest.repoPrivate).toBe(true);
  });

  it("refuses a pull request URL that is not on github.com", () => {
    const body = payload();
    body.pull_request.html_url = "https://evil.example/pull/7";
    expect(parsePullRequestEvent(body, "DevDogsUGA").kind).toBe("ignored");
  });

  it("refuses a body declared larger than GitHub's cap before reading it", async () => {
    const { call } = setup();
    const request = delivery(payload(), {
      "content-length": String(26 * 1024 * 1024),
    });
    const response = await call(request);
    expect(response.status).toBe(413);
  });
});
