/**
 * `import contributions` against a fake GitHub and a fake table: the plan, the
 * dry run, the confirmation, and the signed App token.
 */
import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runContributions, planBackfill } from "./commands.js";
import {
  appJwt,
  fetchMergedPullRequests,
  type MergedPullRequest,
} from "./github.js";

function pr(number: number, authorGithubId: string): MergedPullRequest {
  return {
    repo: "DevDogsUGA/site",
    repoPrivate: false,
    number,
    title: `PR ${number}`,
    url: `https://github.com/DevDogsUGA/site/pull/${number}`,
    mergedAt: new Date("2026-10-01T12:00:00Z"),
    authorGithubId,
    authorLogin: `user-${authorGithubId}`,
  };
}

const FOUND = [pr(1, "100"), pr(2, "200"), pr(3, "300")];
const KEYS = new Set(["DevDogsUGA/site#1"]);
const LINKED = new Set(["200"]);

let stderr: string;

beforeEach(() => {
  stderr = "";
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  process.exitCode = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("planBackfill", () => {
  it("skips what is recorded and splits the rest by linked GitHub", () => {
    const plan = planBackfill(FOUND, KEYS, LINKED);
    expect(plan.fresh.map((p) => p.number)).toEqual([2, 3]);
    expect(plan).toMatchObject({ alreadyRecorded: 1, matched: 1, waiting: 1 });
  });
});

describe("runContributions", () => {
  const base = () => ({
    fetchPulls: async () => FOUND,
    existing: async () => ({ keys: KEYS, linkedGithubIds: LINKED }),
    interactive: false,
  });

  it("writes nothing on a dry run", async () => {
    const apply = vi.fn();
    await runContributions(["--dry-run"], { ...base(), apply });
    expect(apply).not.toHaveBeenCalled();
    expect(stderr).toContain("2 new: 1 by members");
  });

  it("refuses to write without --yes and no terminal", async () => {
    const apply = vi.fn();
    await runContributions([], { ...base(), apply });
    expect(apply).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("records only the new pull requests with --yes", async () => {
    const apply = vi.fn(async (w: readonly MergedPullRequest[]) => ({
      inserted: w.length,
    }));
    await runContributions(["--yes"], { ...base(), apply });
    expect(apply.mock.calls[0]![0].map((p) => p.number)).toEqual([2, 3]);
    expect(process.exitCode).toBeUndefined();
  });

  it("rejects a malformed --since and --repo", async () => {
    await runContributions(["--since", "yesterday"], base());
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    await runContributions(["--repo", "nope"], base());
    expect(process.exitCode).toBe(1);
  });
});

describe("the GitHub App", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("signs an RS256 JWT for the app id", () => {
    const jwt = appJwt("12345", pem, Date.UTC(2026, 9, 20));
    const [head, body, sig] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(head, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      iss: string;
      iat: number;
      exp: number;
    };
    expect(claims.iss).toBe("12345");
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
    expect(
      createVerify("RSA-SHA256")
        .update(`${head}.${body}`)
        .verify(publicKey, Buffer.from(sig, "base64url")),
    ).toBe(true);
  });

  it("accepts a key stored with literal \\n sequences", () => {
    const flat = pem.replace(/\n/g, "\\n");
    expect(() => appJwt("1", flat)).not.toThrow();
  });

  it("lists merged human-authored pull requests and drops the rest", async () => {
    const answers: Record<string, unknown> = {
      "/orgs/DevDogsUGA/installation": { id: 9 },
      "/app/installations/9/access_tokens": { token: "tok" },
      "/installation/repositories": {
        repositories: [{ full_name: "DevDogsUGA/site", private: true }],
      },
      "/repos/DevDogsUGA/site/pulls": [
        {
          number: 1,
          title: "merged",
          html_url: "https://github.com/DevDogsUGA/site/pull/1",
          merged_at: "2026-10-02T00:00:00Z",
          updated_at: "2026-10-03T00:00:00Z",
          user: { id: 5, login: "a", type: "User" },
        },
        {
          number: 2,
          title: "closed unmerged",
          html_url: "u",
          merged_at: null,
          updated_at: "2026-10-03T00:00:00Z",
          user: { id: 5, login: "a", type: "User" },
        },
        {
          number: 3,
          title: "bot",
          html_url: "u",
          merged_at: "2026-10-02T00:00:00Z",
          updated_at: "2026-10-03T00:00:00Z",
          user: { id: 6, login: "renovate[bot]", type: "Bot" },
        },
        {
          number: 4,
          title: "too old",
          html_url: "u",
          merged_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-10-03T00:00:00Z",
          user: { id: 5, login: "a", type: "User" },
        },
      ],
    };
    const doFetch = vi.fn(async (input: string | URL) => {
      const path = new URL(String(input)).pathname;
      return new Response(JSON.stringify(answers[path]), { status: 200 });
    }) as unknown as typeof fetch;
    const found = await fetchMergedPullRequests({
      appId: "1",
      privateKey: pem,
      since: new Date("2026-09-01T00:00:00Z"),
      fetch: doFetch,
    });
    expect(found).toEqual([
      {
        repo: "DevDogsUGA/site",
        repoPrivate: true,
        number: 1,
        title: "merged",
        url: "https://github.com/DevDogsUGA/site/pull/1",
        mergedAt: new Date("2026-10-02T00:00:00Z"),
        authorGithubId: "5",
        authorLogin: "a",
      },
    ]);
  });
});
