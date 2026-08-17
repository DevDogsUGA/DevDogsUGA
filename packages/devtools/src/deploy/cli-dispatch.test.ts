/**
 * The `deploy` group's process contract, driven through the real CLI.
 *
 * ## Why a subprocess and not a call to `runDeployCommand`
 *
 * The property under test is one the in-process suites structurally cannot
 * see: that **nothing decorative reaches stdout**. `cli.ts` opens with
 * `intro("DevDogs devtools")`, and every `@clack/prompts` writer — `intro`,
 * `outro`, `log.*`, `note`, the spinner — writes to stdout, not stderr
 * (measured on 2026-08-16 by running each with the streams captured apart).
 * That is fine for a contributor at a terminal and fatal here: `deploy
 * secrets-file` emits `::add-mask::<token>`, which GitHub recognises only on a
 * line of its own, and `deploy mint-token` emits a JWT its caller takes whole.
 * A banner on that stream is an unmasked production credential in a public
 * repository's job log.
 *
 * Only a real process shows whether the banner happened, so these spawn one.
 *
 * ⚠️ The last test in this file is a POSITIVE CONTROL and is the reason to
 * trust the rest. It runs a NON-deploy command and asserts the banner IS on
 * stdout. Without it, every "stdout is empty" assertion above would pass just
 * as well if the harness were capturing the wrong stream, or if the CLI had
 * stopped producing a banner at all.
 *
 * The child never inherits `process.env`: a developer's shell may hold
 * DEPLOY_ENV, a Bitwarden token, or real credentials, and each of those
 * changes which branch a command takes.
 */
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../instance.js";

const run = promisify(execFile);
const TSX = join(PROJECT_ROOT, "node_modules", ".bin", "tsx");
const CLI = join(PROJECT_ROOT, "packages", "devtools", "src", "cli.ts");

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

async function devtools(
  args: string[],
  env: Record<string, string> = {},
): Promise<Result> {
  try {
    const { stdout, stderr } = await run(
      TSX,
      ["--conditions=development", CLI, ...args],
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

describe("stdout stays clean for every deploy command", () => {
  it("prints no banner when the group is invoked with no subcommand", async () => {
    const { code, stdout, stderr } = await devtools(["deploy"]);
    expect(stdout).toBe("");
    expect(stderr).toContain("write-env");
    expect(code).toBe(1);
  });

  it("prints no banner on an unknown subcommand", async () => {
    const { code, stdout, stderr } = await devtools(["deploy", "not-a-step"]);
    expect(stdout).toBe("");
    expect(stderr).toContain('unknown subcommand "not-a-step"');
    expect(code).toBe(1);
  });

  it("prints no banner when write-env refuses", async () => {
    const { code, stdout, stderr } = await devtools(
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
    const { code, stdout, stderr } = await devtools([
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
    const { code, stdout, stderr } = await devtools(["deploy", "orphans"]);
    expect(stdout).toBe("");
    expect(stderr).toContain("must name a deployed environment");
    expect(code).toBe(1);
  });

  it("prints no banner when airtable-plan refuses", async () => {
    // ⚠️ EXIT 1, not a quiet 0. The step this backs runs on every merge to
    // `main`, and the shape it must never take is the one this repository has
    // already been bitten by: a step guarded on `secrets.X != ''`, which
    // passed green for months without ever running. A missing credential has
    // to be red.
    const { code, stdout, stderr } = await devtools([
      "deploy",
      "airtable-plan",
    ]);
    expect(stdout).toBe("");
    expect(stderr).toContain("AIRTABLE_BASE_ID is not set");
    expect(code).toBe(1);
  });

  it("prints no banner when airtable-apply refuses", async () => {
    const { code, stdout, stderr } = await devtools([
      "deploy",
      "airtable-apply",
    ]);
    expect(stdout).toBe("");
    expect(stderr).toContain("AIRTABLE_BASE_ID is not set");
    expect(code).toBe(1);
  });

  it("names the token variables when only the base id is set", async () => {
    // The refusal a real job hits: the base id variable is there and the
    // token secret is not. Both commands have to say WHICH variable, and
    // each has to name its own row rather than a shared list.
    const plan = await devtools(["deploy", "airtable-plan"], {
      AIRTABLE_BASE_ID: "appTESTTESTTEST01",
    });
    expect(plan.stdout).toBe("");
    expect(plan.stderr).toContain("AIRTABLE_PLAN_PAT, AIRTABLE_PAT");
    expect(plan.code).toBe(1);

    const apply = await devtools(["deploy", "airtable-apply"], {
      AIRTABLE_BASE_ID: "appTESTTESTTEST01",
    });
    expect(apply.stdout).toBe("");
    expect(apply.stderr).toContain("AIRTABLE_APPLY_PAT, AIRTABLE_PAT");
    expect(apply.code).toBe(1);
    // POSITIVE CONTROL on the pairing: neither refusal offers the other's
    // token as a way out, which is the whole point of two disjoint rows.
    expect(plan.stderr).not.toContain("AIRTABLE_APPLY_PAT, AIRTABLE_PAT");
    expect(apply.stderr).not.toContain("AIRTABLE_PLAN_PAT, AIRTABLE_PAT");
  });
});

describe("argument refusals", () => {
  it("refuses --source with nothing after it", async () => {
    // `flagValue` cannot tell this from "absent", and absent means compose
    // EVERYTHING rather than one manifest's narrow slice.
    const { code, stdout, stderr } = await devtools(
      ["deploy", "write-env", "--source"],
      { DEPLOY_ENV: "staging" },
    );
    expect(stdout).toBe("");
    expect(stderr).toContain("--source needs a manifest name");
    expect(code).toBe(1);
  });

  it("refuses --app with nothing after it", async () => {
    const { code, stdout, stderr } = await devtools([
      "deploy",
      "secrets-file",
      "--app",
    ]);
    expect(stdout).toBe("");
    expect(stderr).toContain("--app <name> is required");
    expect(code).toBe(1);
  });

  it("refuses the old `--mint <script>` form by name", async () => {
    // Ignoring the path would silently keep working — and keep looking like a
    // way to name any executable on the runner whose stdout becomes a Worker
    // secret.
    const { code, stdout, stderr } = await devtools([
      "deploy",
      "secrets-file",
      "--app",
      "sandbox",
      "--mint",
      "scripts/mint-sandbox-token.mjs",
    ]);
    expect(stdout).toBe("");
    expect(stderr).toContain("`--mint` no longer takes a script path");
    expect(stderr).toContain("scripts/mint-sandbox-token.mjs");
    expect(code).toBe(1);
  });

  it("does not read a flag's value as the subcommand", async () => {
    // `positionals()` exists for this: `--source orphans write-env` must run
    // write-env, not orphans, because one of those deletes things.
    const { code, stdout, stderr } = await devtools(
      ["deploy", "--source", "orphans", "write-env"],
      { DEPLOY_ENV: "staging", DEPLOY_GITHUB_SECRETS: "{" },
    );
    expect(stdout).toBe("");
    expect(stderr).toContain("devtools deploy write-env:");
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
