/**
 * `deploy preflight` — the 540-vs-everything-else exit contract.
 *
 * That contract gates a deploy job: **returning** means exit 0 (healthy OR
 * paused), **throwing** means exit 1, and `paused` in `$GITHUB_OUTPUT` is what
 * the workflow reads to decide whether to run the deploy at all. Collapse
 * "paused" into "broken" and every staging week turns CI red; collapse
 * "broken" into "paused" and a genuinely broken project silently skips its
 * deploy forever. Both directions are asserted, because a suite that only
 * checked one would stay green under the inversion.
 *
 * The fetch is injected, so the 540 branch is reachable without finding a real
 * paused project. The two file writes are NOT injected: `$GITHUB_OUTPUT` and
 * `$GITHUB_STEP_SUMMARY` are paths the environment supplies, so these point
 * them at a temp file and assert the real bytes.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeployError } from "./report.js";
import {
  PAUSED_STATUS,
  runPreflight,
  TRANSPORT_ATTEMPTS,
  type PreflightVerdict,
} from "./preflight.js";

const REF = "abcdefghijklmnopqrst";
const KEY = "sb_publishable_not_a_real_key";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "devdogs-preflight-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Harness {
  verdict: PreflightVerdict | null;
  error: DeployError | null;
  /** Every line the command reported, joined. */
  log: string;
  /** Every URL the command actually requested. */
  requests: string[];
  headers: (Record<string, string> | undefined)[];
  outputFile: string | null;
  summaryFile: string | null;
}

/**
 * @param statuses One per attempt. A number is an HTTP status; an Error means
 *   the fetch rejected, which is the transport case.
 */
async function preflight(
  statuses: (number | Error)[],
  env: Record<string, string | undefined> = {},
  { github = true }: { github?: boolean } = {},
): Promise<Harness> {
  const outputPath = join(dir, "output");
  const summaryPath = join(dir, "summary");
  let log = "";
  const requests: string[] = [];
  const headers: (Record<string, string> | undefined)[] = [];
  let attempt = 0;

  const read = (path: string): string | null => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  };

  const base: Record<string, string | undefined> = {
    PROJECT_REF: REF,
    PUBLISHABLE_KEY: KEY,
    ...(github
      ? { GITHUB_OUTPUT: outputPath, GITHUB_STEP_SUMMARY: summaryPath }
      : {}),
    ...env,
  };
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) delete base[key];
  }

  const shared = {
    env: base,
    fetch: (async (url: string, init?: RequestInit) => {
      requests.push(String(url));
      headers.push(init?.headers as Record<string, string> | undefined);
      const next = statuses[attempt] ?? statuses.at(-1)!;
      attempt += 1;
      if (next instanceof Error) throw next;
      // Only `status` and `statusText` are read, so a real Response is
      // unnecessary — and building one would drag in undici's own semantics.
      return { status: next, statusText: `status ${next}` } as Response;
    }) as unknown as typeof globalThis.fetch,
    report: (lines: readonly string[]) => {
      log += `${lines.join("\n")}\n`;
    },
  };

  const finish = (
    verdict: PreflightVerdict | null,
    error: DeployError | null,
  ): Harness => ({
    verdict,
    error,
    log,
    requests,
    headers,
    outputFile: read(outputPath),
    summaryFile: read(summaryPath),
  });

  try {
    return finish(await runPreflight(shared), null);
  } catch (err) {
    // A non-DeployError is a crash, and a crash is exactly what the refusal
    // paths must not become — so it is surfaced rather than swallowed.
    if (!(err instanceof DeployError)) throw err;
    return finish(null, err);
  }
}

describe("the exit contract", () => {
  it("returns paused=true on 540 — exit 0, and the deploy is skipped", async () => {
    const { verdict, error, outputFile } = await preflight([540]);
    expect(error).toBeNull();
    expect(verdict).toEqual({ paused: true });
    expect(outputFile).toBe("paused=true\n");
  });

  it("returns paused=false on 200 — exit 0, and the deploy runs", async () => {
    const { verdict, error, outputFile } = await preflight([200]);
    expect(error).toBeNull();
    expect(verdict).toEqual({ paused: false });
    expect(outputFile).toBe("paused=false\n");
  });

  it("throws on every other status, and writes NO verdict", async () => {
    // The half that must not rot into a skip. A `paused` output here would be
    // read by the workflow as a legitimate reason not to deploy.
    for (const status of [201, 301, 400, 401, 403, 404, 429, 500, 502, 503]) {
      const { verdict, error, outputFile } = await preflight([status]);
      expect(verdict, `status ${status}`).toBeNull();
      expect(error, `status ${status}`).toBeInstanceOf(DeployError);
      expect(outputFile, `status ${status}`).toBeNull();
    }
  });

  it("does not treat statuses NEAR 540 as paused", async () => {
    // 540 is a bare literal in Supabase's docs and nowhere in any HTTP
    // registry, so an off-by-one or a `>= 540` would be invisible.
    for (const status of [539, 541, 504, 550]) {
      const { verdict, error } = await preflight([status]);
      expect(verdict, `status ${status}`).toBeNull();
      expect(error, `status ${status}`).toBeInstanceOf(DeployError);
    }
  });

  it("names the status it refused, so the log says which fault it was", async () => {
    const { error } = await preflight([404]);
    expect(error?.message).toContain("404");
    expect(error?.detail.join("\n")).toContain("Only 540 is skippable");
  });

  it("uses 540 as the paused constant", () => {
    expect(PAUSED_STATUS).toBe(540);
  });
});

describe("the step summary", () => {
  it("is written on 540, naming the ref and the dashboard link", async () => {
    const { summaryFile, log } = await preflight([540]);
    expect(summaryFile).toContain("Staging is paused");
    expect(summaryFile).toContain("HTTP 540");
    expect(summaryFile).toContain(
      `https://supabase.com/dashboard/project/${REF}`,
    );
    // Also echoed to the log, so a reader of a green-but-idle job sees the
    // reason without opening the summary tab.
    expect(log).toContain("Staging is paused");
  });

  it("is NOT written on 200 or on a failure", async () => {
    for (const status of [200, 500]) {
      const { summaryFile } = await preflight([status]);
      expect(summaryFile, `status ${status}`).toBeNull();
    }
  });

  it("still classifies correctly with no GitHub env at all", async () => {
    // It runs locally too, and an unset GITHUB_OUTPUT must not become an
    // ENOENT that turns a paused project into a failed job.
    const { verdict, error, outputFile, summaryFile } = await preflight(
      [540],
      {},
      { github: false },
    );
    expect(error).toBeNull();
    expect(verdict).toEqual({ paused: true });
    expect(outputFile).toBeNull();
    expect(summaryFile).toBeNull();
  });
});

describe("the request", () => {
  it("asks the project's auth health endpoint, with the publishable key", async () => {
    const { requests, headers } = await preflight([200]);
    // NOT `/rest/v1/`: the REST root is the OpenAPI schema document, which
    // Supabase answers with 401 for any non-secret key — a healthy project
    // would land in the "broken" bucket (it did, on the first real run).
    expect(requests).toEqual([`https://${REF}.supabase.co/auth/v1/health`]);
    // The positive control for the header: without an apikey, the gateway
    // answers 401 and a healthy project lands in the "broken" bucket.
    expect(headers[0]).toEqual({ apikey: KEY });
  });
});

describe("retries", () => {
  it("retries a rejected fetch, up to three attempts", async () => {
    const { verdict, requests } = await preflight([
      new Error("EAI_AGAIN"),
      new Error("EAI_AGAIN"),
      200,
    ]);
    expect(requests).toHaveLength(TRANSPORT_ATTEMPTS);
    expect(verdict).toEqual({ paused: false });
  });

  it("gives up after three, and fails rather than guessing", async () => {
    const { error, requests } = await preflight([
      new Error("EAI_AGAIN"),
      new Error("EAI_AGAIN"),
      new Error("EAI_AGAIN"),
      200,
    ]);
    expect(requests).toHaveLength(TRANSPORT_ATTEMPTS);
    expect(error).toBeInstanceOf(DeployError);
    expect(error?.detail.join("\n")).toContain("nothing answered at all");
  });

  it("does NOT retry a status — an answer is the thing being classified", async () => {
    // Retrying a 500 would just ask the same question again, and a retried
    // 540 would triple the latency of the expected case.
    for (const status of [500, 540, 200]) {
      const { requests } = await preflight([status]);
      expect(requests, `status ${status}`).toHaveLength(1);
    }
  });
});

describe("refusing before it classifies anything", () => {
  it("refuses an unset PROJECT_REF without making a request", async () => {
    const { error, requests } = await preflight([200], {
      PROJECT_REF: undefined,
    });
    expect(error?.message).toContain("PROJECT_REF");
    expect(requests).toHaveLength(0);
  });

  it("refuses an unset PUBLISHABLE_KEY without making a request", async () => {
    // Guarded because a keyless 401 is indistinguishable from broken — this
    // refusal is what stops a healthy project from failing its deploy.
    const { error, requests } = await preflight([200], {
      PUBLISHABLE_KEY: undefined,
    });
    expect(error?.message).toContain("PUBLISHABLE_KEY");
    expect(requests).toHaveLength(0);
  });

  it("refuses an EMPTY ref or key, not just an absent one", async () => {
    for (const env of [{ PROJECT_REF: "" }, { PUBLISHABLE_KEY: "" }]) {
      const { error, requests } = await preflight([200], env);
      expect(error, JSON.stringify(env)).toBeInstanceOf(DeployError);
      expect(requests, JSON.stringify(env)).toHaveLength(0);
    }
  });

  it("explains itself rather than ending at a stack trace", async () => {
    // A DeployError is rendered by cli.ts as a message plus indented detail;
    // anything else would reach the runner as an unhandled rejection.
    const { error } = await preflight([200], { PROJECT_REF: undefined });
    expect(error).toBeInstanceOf(DeployError);
    // The hint is the point of refusing by name: PROJECT_REF is a GitHub
    // variable, and "where do I set it" is the next question.
    expect(error?.detail.join("\n")).toContain("VARIABLE");
  });
});
