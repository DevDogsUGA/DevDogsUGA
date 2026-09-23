/**
 * The `deploy` group's process contract, driven through the real CI bin.
 *
 * ## Why a subprocess and not a call to `runDeployCommand`
 *
 * The property under test is one the in-process suites structurally cannot
 * see: that **nothing decorative reaches stdout**. `cli.ts` opens with
 * `intro("DevDogs devtools")`, and every `@clack/prompts` writer goes to
 * stdout, not stderr: `intro`, `outro`, `log.*`, `note`, the spinner
 * (measured on 2026-08-16 by running each with the streams captured apart).
 * That is fine for a contributor at a terminal and fatal here: a deploy step's
 * stdout can be a credential channel, and a banner on that stream would be an
 * unmasked production value landing in a public repository's job log.
 *
 * Only a real process shows whether the banner happened, so these spawn one.
 *
 * Deploy commands now live in the `ci` bin (`src/ci.ts`). The positive control
 * at the end of this file still uses `cli.ts` to verify that the banner-
 * suppression property actually means something: if `cli.ts` stops printing a
 * banner at all, every "stdout is empty" assertion above becomes vacuously true.
 *
 * The child never inherits `process.env`: a developer's shell may hold
 * DEPLOY_ENV, a Bitwarden token, or real credentials, and each of those
 * changes which branch a command takes.
 */
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PROJECT_ROOT } from "../instance.js";

const run = promisify(execFile);
const TSX = join(PROJECT_ROOT, "node_modules", ".bin", "tsx");
const CLI = join(PROJECT_ROOT, "packages", "devtools", "src", "cli.ts");
const CI = join(PROJECT_ROOT, "packages", "devtools", "src", "ci.ts");
// A cold CLI boot reached 5.02s under the full CI workload. Every test in this
// file intentionally boots a real TypeScript process, so use a subprocess-sized
// deadline rather than Vitest's unit-test default.
const CLI_TEST_TIMEOUT = 15_000;
vi.setConfig({ testTimeout: CLI_TEST_TIMEOUT });
afterAll(() => {
  vi.resetConfig();
});

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

async function spawn(
  bin: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<Result> {
  try {
    const { stdout, stderr } = await run(
      TSX,
      ["--conditions=devdogs-source", bin, ...args],
      // PATH and HOME only. See the header.
      {
        cwd: PROJECT_ROOT,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          ...env,
        },
      },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: e.code ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

const devtools = (args: string[], env?: Record<string, string>) =>
  spawn(CLI, args, env);
const ci = (args: string[], env?: Record<string, string>) =>
  spawn(CI, args, env);

describe("stdout stays clean for every deploy command", () => {
  it("prints no banner when the group is invoked with no subcommand", async () => {
    const { code, stdout, stderr } = await ci(["deploy"]);
    expect(stdout).toBe("");
    expect(stderr).toContain("write-env");
    expect(code).toBe(1);
  });

  it("prints no banner on an unknown subcommand", async () => {
    const { code, stdout, stderr } = await ci(["deploy", "not-a-step"]);
    expect(stdout).toBe("");
    expect(stderr).toContain('unknown subcommand "not-a-step"');
    expect(code).toBe(1);
  });

  it("prints no banner when write-env refuses", async () => {
    const { code, stdout, stderr } = await ci(
      ["deploy", "write-env"],
      // No DEPLOY_ENV, so it refuses before composing anything and before it
      // could reach a write.
      {},
    );
    expect(stdout).toBe("");
    expect(stderr).toContain("must name a deployed environment");
    expect(code).toBe(1);
  });

  it("prints no banner when secrets-file refuses", async () => {
    // Against the REAL registry: apps/sandbox/env.ts declares a minted key,
    // so this is also a check that the CLI loads the manifests at all.
    const { code, stdout, stderr } = await ci([
      "deploy",
      "secrets-file",
      "--app",
      "sandbox",
    ]);
    expect(stdout).toBe("");
    expect(stderr).toContain("SANDBOX_PROXY_TOKEN");
    expect(code).toBe(1);
  });

  it("prints no banner when orphans refuses", async () => {
    const { code, stdout, stderr } = await ci(["deploy", "orphans"]);
    expect(stdout).toBe("");
    expect(stderr).toContain("must name a deployed environment");
    expect(code).toBe(1);
  });
});

describe("argument refusals", () => {
  it("refuses --source with nothing after it", async () => {
    // `flagValue` cannot tell this from "absent", and absent means compose
    // EVERYTHING rather than one manifest's narrow slice.
    const { code, stdout, stderr } = await ci(
      ["deploy", "write-env", "--source"],
      { DEPLOY_ENV: "staging" },
    );
    expect(stdout).toBe("");
    expect(stderr).toContain("--source needs a manifest name");
    expect(code).toBe(1);
  });

  it("refuses --app with nothing after it", async () => {
    const { code, stdout, stderr } = await ci([
      "deploy",
      "secrets-file",
      "--app",
    ]);
    expect(stdout).toBe("");
    expect(stderr).toContain("--app <name> is required");
    expect(code).toBe(1);
  });

  it("does not read a flag's value as the subcommand", async () => {
    // `positionals()` exists for this: `--source orphans write-env` must run
    // write-env, not orphans, because one of those deletes things.
    const { code, stdout, stderr } = await ci(
      ["deploy", "--source", "orphans", "write-env"],
      { DEPLOY_ENV: "staging", DEPLOY_GITHUB_SECRETS: "{" },
    );
    expect(stdout).toBe("");
    expect(stderr).toContain("devtools-ci deploy write-env:");
    expect(code).toBe(1);
  });
});

describe("positive control", () => {
  it("a NON-deploy command does print the banner, on stdout", async () => {
    // If this ever goes red, every "stdout is empty" assertion above has
    // stopped meaning anything: either the harness is looking at the wrong
    // stream, or `intro()` no longer writes to stdout, and in both cases the
    // suppression for the deploy group would be untested.
    const { code, stdout } = await devtools(["not-a-command"]);
    expect(stdout).toContain("DevDogs devtools");
    expect(code).toBe(1);
  });
});
