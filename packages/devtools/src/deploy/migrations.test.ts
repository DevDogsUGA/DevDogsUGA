import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeployError } from "./report.js";
import { runDeployMigrate, runDeployPlan } from "./migrations.js";

/**
 * The commands' own concerns, driven through injected fakes — the argv the
 * push runner receives, the missing-variable refusals, the summary framing, and
 * the one invariant raw shell could never assert: a failed connection during a
 * dry run must fail the step, not read as a clean plan. No live database.
 */

let dir: string;
let summaryPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "deploy-migrations-"));
  summaryPath = join(dir, "summary.md");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function readSummary(): string {
  try {
    return readFileSync(summaryPath, "utf8");
  } catch {
    return "";
  }
}

describe("deploy migrate", () => {
  it("refuses when DB_URL is absent, naming the variable", async () => {
    // The wrong diagnosis would be a push failure. An empty env var is the
    // secret-never-pushed case, and the message has to say so.
    let called = false;
    const push = async () => {
      called = true;
      return 0;
    };
    await expect(runDeployMigrate({}, push)).rejects.toThrow(DeployError);
    await expect(runDeployMigrate({}, push)).rejects.toThrow(/DB_URL/);
    expect(called).toBe(false);
  });

  it("pushes exactly the given URL and resolves on a clean apply", async () => {
    const urls: string[] = [];
    const push = async (url: string) => {
      urls.push(url);
      return 0;
    };
    await runDeployMigrate({ DB_URL: "postgresql://x" }, push);
    expect(urls).toEqual(["postgresql://x"]);
  });

  it("fails the job with a DeployError when the push exits non-zero", async () => {
    const push = async () => 1;
    const run = runDeployMigrate({ DB_URL: "postgresql://x" }, push);
    await expect(run).rejects.toThrow(DeployError);
    await expect(
      runDeployMigrate({ DB_URL: "postgresql://x" }, push),
    ).rejects.toThrow(/exit 1/);
  });
});

describe("deploy plan", () => {
  it("refuses when DB_URL is absent, naming the variable", async () => {
    let called = false;
    const plan = async () => {
      called = true;
      return "";
    };
    await expect(runDeployPlan("Migration plan", {}, plan)).rejects.toThrow(
      DeployError,
    );
    await expect(runDeployPlan("Migration plan", {}, plan)).rejects.toThrow(
      /DB_URL/,
    );
    expect(called).toBe(false);
  });

  it("writes the labelled plan, fenced, to the job summary", async () => {
    const urls: string[] = [];
    const plan = async (url: string) => {
      urls.push(url);
      return "Would apply 20260805000002_sandbox_proxy.sql";
    };
    await runDeployPlan(
      "Migration plan — production",
      { DB_URL: "postgresql://x", GITHUB_STEP_SUMMARY: summaryPath },
      plan,
    );
    expect(urls).toEqual(["postgresql://x"]);
    const written = readSummary();
    expect(written).toContain("### Migration plan — production");
    expect(written).toContain("```");
    expect(written).toContain("Would apply 20260805000002_sandbox_proxy.sql");
  });

  it("fails the step and writes NO plan when the connection is dead", async () => {
    // The invariant the old `set -o pipefail` protected: a dry run that never
    // connected must not read as an empty (clean) plan.
    const plan = async () => {
      throw new Error("supabase db push --dry-run failed:\nconnection refused");
    };
    const run = runDeployPlan(
      "Migration plan",
      { DB_URL: "postgresql://x", GITHUB_STEP_SUMMARY: summaryPath },
      plan,
    );
    await expect(run).rejects.toThrow(/connection refused/);
    expect(readSummary()).toBe("");
  });
});
