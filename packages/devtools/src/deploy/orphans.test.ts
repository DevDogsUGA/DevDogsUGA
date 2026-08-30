/**
 * `devtools deploy orphans`, and above all the gate on `--prune`.
 *
 * ⚠️ Cloudflare is INJECTED, and that is why this file can test the thing
 * worth testing. With the real `listWorkerSecrets`, a machine with no wrangler
 * credential returns every Worker as unreadable, `total` is 0, and the command
 * returns before it reaches the prune branch. A suite written that way passes
 * whether or not the gate exists, a shape of test this repository has been
 * bitten by. So the lister here always returns orphans, and `deleteSecret`
 * records its calls, so "nothing was deleted" is a positive assertion about a
 * reachable branch.
 *
 * Each deletion PUBLISHES A NEW VERSION of the code already deployed, so a
 * report path that deleted would be a report path that deployed, bypassing
 * both the promotion PR and the `production-apply` reviewers.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { declare, define, resetRegistry } from "@devdogsuga/env";
import { runDeployOrphans, type OrphansOptions } from "./orphans.js";

/**
 * A tripwire.
 *
 * `deleteSecret` defaults to the real wrangler call, so any test here that
 * reached a deletion without meaning to would spawn
 * `pnpm exec wrangler secret delete` against whatever credential the machine
 * running the suite happens to hold. Every case goes through `audit()`, which
 * plants this; the pruning cases override it with a spy.
 */
const NEVER_DELETE = (): never => {
  throw new Error(
    "deleteSecret was reached by a test that is not about pruning",
  );
};

function audit(
  options: Partial<OrphansOptions> & Pick<OrphansOptions, "listSecrets">,
) {
  return runDeployOrphans({
    prune: false,
    deleteSecret: NEVER_DELETE,
    ...options,
  });
}

/** Cloudflare's answer, as `listWorkerSecrets` shapes it. */
function lister(
  workers: Record<string, string[]>,
  unreadable: string[] = [],
): () => Promise<{ secrets: Map<string, Set<string>>; unreadable: string[] }> {
  return () =>
    Promise.resolve({
      secrets: new Map(
        Object.entries(workers).map(([worker, keys]) => [
          worker,
          new Set(keys),
        ]),
      ),
      unreadable,
    });
}

beforeEach(() => {
  resetRegistry();

  declare({
    source: "sandbox",
    server: {
      SANDBOX_STORED: define(z.string(), {
        doc: "A stored secret the Worker reads.",
        scope: "environment",
        secrecy: "secret",
      }),
      SANDBOX_PROXY_TOKEN: define(z.string(), {
        doc: "Minted at deploy time; no stored copy anywhere.",
        scope: "environment",
        secrecy: "secret",
        minted: true,
      }),
      SANDBOX_PUBLIC: define(z.string(), {
        doc: "Public, so never a Worker secret and never expected as one.",
        scope: "environment",
        secrecy: "public",
      }),
    },
  });

  declare({
    source: "platform",
    server: {
      PLATFORM_SECRET: define(z.string(), {
        doc: "Another app's secret.",
        scope: "environment",
        secrecy: "secret",
      }),
    },
  });
});

describe("what counts as an orphan", () => {
  it("reports a name the app's manifest no longer declares", async () => {
    const result = await audit({
      prune: false,
      env: { DEPLOY_ENV: "production" },
      listSecrets: lister({
        "production-sandbox": ["SANDBOX_STORED", "RENAMED_LAST_MONTH"],
      }),
    });
    expect(result.orphans).toBe(1);
  });

  it("does NOT report a minted key", async () => {
    // `SANDBOX_PROXY_TOKEN` is in no Bitwarden project and no GitHub store by
    // design. An audit reasoning from stored copies alone would offer the live
    // proxy credential up for deletion. `env audit` had exactly that bug.
    const result = await audit({
      prune: false,
      env: { DEPLOY_ENV: "production" },
      listSecrets: lister({
        "production-sandbox": ["SANDBOX_STORED", "SANDBOX_PROXY_TOKEN"],
      }),
    });
    expect(result.orphans).toBe(0);
  });

  it("scopes expectations to the app that owns the Worker", async () => {
    // PLATFORM_SECRET is declared, just not by sandbox, so finding it on the
    // sandbox Worker is exactly the "sent to the wrong Worker" case.
    const result = await audit({
      prune: false,
      env: { DEPLOY_ENV: "production" },
      listSecrets: lister({ "production-sandbox": ["PLATFORM_SECRET"] }),
    });
    expect(result.orphans).toBe(1);
  });

  it("reads DEPLOY_ENV to pick the Worker names", async () => {
    const result = await audit({
      prune: false,
      env: { DEPLOY_ENV: "staging" },
      listSecrets: lister({
        // Named for production, so a staging run must not look at it.
        "production-sandbox": ["RENAMED_LAST_MONTH"],
        "staging-sandbox": ["SANDBOX_STORED"],
      }),
    });
    expect(result.orphans).toBe(0);
  });

  it("still reports what it could see when a Worker is unreadable", async () => {
    // A Worker that has never been deployed is the ordinary reason. An audit
    // that refuses to run is an audit nobody runs.
    const result = await audit({
      prune: false,
      env: { DEPLOY_ENV: "production" },
      listSecrets: lister({ "production-sandbox": ["RENAMED_LAST_MONTH"] }, [
        "production-platform",
        "production-schedule-builder",
      ]),
    });
    expect(result.orphans).toBe(1);
  });
});

describe("the --prune gate", () => {
  it("deletes NOTHING without --prune, even having found orphans", async () => {
    const deleteSecret = vi.fn();

    const result = await audit({
      prune: false,
      env: { DEPLOY_ENV: "production" },
      listSecrets: lister({
        "production-sandbox": ["SANDBOX_STORED", "RENAMED_LAST_MONTH"],
      }),
      deleteSecret,
    });

    expect(result.orphans).toBe(1);
    expect(result.pruned).toEqual([]);
    expect(deleteSecret).not.toHaveBeenCalled();
  });

  it("deletes each one WITH --prune", async () => {
    // The positive control for the assertion above: the same inputs, the same
    // injected deleter, one flag different.
    const deleteSecret = vi.fn();

    const result = await audit({
      prune: true,
      env: { DEPLOY_ENV: "production" },
      listSecrets: lister({
        "production-sandbox": ["SANDBOX_STORED", "RENAMED_LAST_MONTH"],
        "production-platform": ["PLATFORM_SECRET", "ALSO_STALE"],
      }),
      deleteSecret,
    });

    expect(result.pruned).toEqual([
      "production-platform/ALSO_STALE",
      "production-sandbox/RENAMED_LAST_MONTH",
    ]);
    expect(deleteSecret.mock.calls).toEqual([
      ["platform", "ALSO_STALE", "production"],
      ["sandbox", "RENAMED_LAST_MONTH", "production"],
    ]);
  });

  it("does not call the deleter when there is nothing to delete", async () => {
    const deleteSecret = vi.fn();
    await audit({
      prune: true,
      env: { DEPLOY_ENV: "production" },
      listSecrets: lister({ "production-sandbox": ["SANDBOX_STORED"] }),
      deleteSecret,
    });
    expect(deleteSecret).not.toHaveBeenCalled();
  });
});

describe("exit behaviour", () => {
  it("does not fail the deploy when it finds orphans", async () => {
    // A stale secret name is not a defect in the change that was just shipped,
    // and failing here would make an unrelated commit responsible for somebody
    // else's deferred cleanup.
    await expect(
      audit({
        prune: false,
        env: { DEPLOY_ENV: "production" },
        listSecrets: lister({ "production-sandbox": ["RENAMED_LAST_MONTH"] }),
      }),
    ).resolves.toMatchObject({ orphans: 1 });
  });

  it("DOES fail when a deletion it was asked for did not happen", async () => {
    await expect(
      audit({
        prune: true,
        env: { DEPLOY_ENV: "production" },
        listSecrets: lister({ "production-sandbox": ["RENAMED_LAST_MONTH"] }),
        deleteSecret: () => {
          throw new Error("wrangler said no");
        },
      }),
    ).rejects.toThrow(/Could not delete RENAMED_LAST_MONTH/);
  });

  it("refuses DEPLOY_ENV=development", async () => {
    await expect(
      audit({
        prune: false,
        env: {},
        listSecrets: lister({}),
      }),
    ).rejects.toThrow(/must name a deployed environment/);
  });
});

describe("the job summary", () => {
  function summaryFile(): string {
    return join(mkdtempSync(join(tmpdir(), "orphans-test-")), "summary.md");
  }

  it("records the orphaned names and how to remove them", async () => {
    const path = summaryFile();
    await audit({
      prune: false,
      env: { DEPLOY_ENV: "production", GITHUB_STEP_SUMMARY: path },
      listSecrets: lister({
        "production-sandbox": ["SANDBOX_STORED", "RENAMED_LAST_MONTH"],
      }),
    });

    const written = readFileSync(path, "utf8");
    expect(written).toContain("Worker secret audit");
    expect(written).toContain("**1 orphaned**: `RENAMED_LAST_MONTH`");
    expect(written).toContain("Nothing was deleted");
    expect(written).toContain("production-apply");
  });

  it("says so when there is nothing unaccounted for", async () => {
    const path = summaryFile();
    await audit({
      prune: false,
      env: { DEPLOY_ENV: "production", GITHUB_STEP_SUMMARY: path },
      listSecrets: lister({ "production-sandbox": ["SANDBOX_STORED"] }),
    });
    expect(readFileSync(path, "utf8")).toContain("No orphaned secrets.");
  });

  it("records a failed deletion before it throws", async () => {
    // The report is the whole product of a prune run, so a failure part-way
    // through must not take the record of what did happen with it.
    const path = summaryFile();
    let calls = 0;

    await expect(
      audit({
        prune: true,
        env: { DEPLOY_ENV: "production", GITHUB_STEP_SUMMARY: path },
        listSecrets: lister({
          "production-platform": ["FIRST_STALE"],
          "production-sandbox": ["SECOND_STALE"],
        }),
        deleteSecret: () => {
          calls += 1;
          if (calls === 2) throw new Error("wrangler said no");
        },
      }),
    ).rejects.toThrow();

    const written = readFileSync(path, "utf8");
    expect(written).toContain("deleted `FIRST_STALE`");
    expect(written).toContain("**failed** to delete `SECOND_STALE`");
  });
});
