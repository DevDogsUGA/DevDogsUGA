#!/usr/bin/env tsx
/**
 * `devtools-ci deploy <app|step> [flags]`
 *
 * The CI entry point. No wizard, no `with-env`, no `@clack/prompts`. Every
 * command in this bin runs in a GitHub Actions job and is expected to report
 * its own results to the log. Failures exit non-zero.
 *
 * ## Why a separate bin
 *
 * The contributor CLI (`devtools`) loads `with-env`, prompts interactively,
 * and wraps output in clack's box-drawing. None of that belongs in a deploy
 * job. Two of the step commands — `secrets-file` and `mint-token` — emit a
 * credential or a mask directive on stdout, so any banner on that stream is
 * either an unmasked secret in the job log or a broken `::add-mask::` line.
 * The separation is structural: a separate entry point that never imports
 * clack is one that cannot accidentally add a banner.
 *
 * ## The deploy orchestrator
 *
 * `devtools-ci deploy <app> --tier <staging|production>` replaces the three
 * near-identical `cf:deploy:*` shell strings in the app package.json files.
 * It runs `require-token`, then the app-specific deploy commands (docs index
 * for platform, opennextjs-cloudflare for platform/schedule-builder, wrangler
 * for sandbox).
 *
 * Step commands (`write-env`, `secrets-file`, etc.) are still individually
 * addressable for jobs that run only one step.
 */
import { spawn } from "node:child_process";
import {
  applyWranglerLocalDatabaseAlias,
  HYPERDRIVE_LOCAL_CONNECTION_ENV,
} from "@devdogsuga/env/load";
import { DeployError, say } from "./deploy/report.js";
import { renderWriteEnvReport, runDeployWriteEnv } from "./deploy/write-env.js";
import { runDeploySecretsFile } from "./deploy/secrets-file.js";
import { runDeployOrphans } from "./deploy/orphans.js";
import { runMintToken } from "./deploy/mint-token.js";
import { runDeployAirtablePlan } from "./deploy/airtable-plan.js";
import { runDeployAirtableApply } from "./deploy/airtable-apply.js";
import { runPreflight } from "./deploy/preflight.js";
import { runRequirePlanner } from "./deploy/require-planner.js";
import { runRequireToken } from "./deploy/require-token.js";
import { runDocsIndex } from "./docs/index-pages.js";
import { loadRegistry } from "./env/discovery.js";
import { positionals } from "./args.js";
import { findCiCommand, subcommandCiNames } from "./commands.js";
import { isWorkerApp, WORKER_APPS } from "./workers.js";

function flagValue(rest: string[], flag: string): string | undefined {
  const index = rest.indexOf(flag);
  if (index === -1) return undefined;
  const value = rest[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

// ── App orchestrators ─────────────────────────────────────────────────────────

// `WORKER_APPS` is read from root `workers.json` at runtime rather than
// declared as a literal tuple, so it cannot narrow to a union of string
// literals the way the old `["platform", ...] as const` did. `App` stays
// `string`; `isApp` still refuses anything not in the shared list.
type App = string;

function isApp(value: string): value is App {
  return isWorkerApp(value);
}

/**
 * Wrangler's local Hyperdrive emulator wants its binding-specific alias, not
 * `DB_URL`. Mirror both of `process.env`'s relevant keys into a scratch
 * object so the shared `applyWranglerLocalDatabaseAlias` guard — never
 * clobber an alias someone already set — runs against the same values it
 * would in-process, then hand back only the alias override for `pnpm()`'s
 * env merge (`DB_URL` itself reaches the child already, via the base
 * `process.env` spread).
 */
function hyperdriveLocalAliasEnv(): Record<string, string> {
  const scratch: Record<string, string> = {};
  const existingAlias = process.env[HYPERDRIVE_LOCAL_CONNECTION_ENV];
  if (existingAlias !== undefined) {
    scratch[HYPERDRIVE_LOCAL_CONNECTION_ENV] = existingAlias;
  }
  if (process.env.DB_URL !== undefined) scratch.DB_URL = process.env.DB_URL;
  applyWranglerLocalDatabaseAlias(scratch);
  delete scratch.DB_URL;
  return scratch;
}

/**
 * Runs a command via pnpm, inheriting stdio, returning the exit code.
 *
 * All orchestrator steps are external processes rather than imported functions:
 * opennextjs-cloudflare and wrangler own their own stdout and must not be
 * wrapped.
 */
function pnpm(args: string[], env?: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/**
 * `devtools-ci deploy <app> --tier <staging|production>`
 *
 * Orchestrates the full deploy for one app:
 *   1. `require-token` guard
 *   2. Docs index (platform only)
 *   3. App deploy via opennextjs-cloudflare / wrangler
 *
 * The `--dry-run` flag prints what would run and exits 0.
 */
async function runAppDeploy(app: App, rest: string[]): Promise<void> {
  const tier = flagValue(rest, "--tier") ?? process.env.DEPLOY_ENV;
  if (!tier) {
    throw new DeployError("--tier <staging|production> is required.", [
      "Or set DEPLOY_ENV in the environment.",
    ]);
  }
  if (tier !== "staging" && tier !== "production") {
    throw new DeployError(`Unknown tier "${tier}".`, [
      "Use --tier staging or --tier production.",
    ]);
  }

  const dryRun = rest.includes("--dry-run");
  const secretsFile = process.env.DEPLOY_SECRETS_FILE;

  const steps: { label: string; fn: () => Promise<number> }[] = [];

  if (app === "platform") {
    steps.push({
      label: "Index docs",
      fn: async () => {
        const buildCode = await pnpm(["--filter", "@devdogsuga/docs", "build"]);
        if (buildCode !== 0) return buildCode;
        const before = process.exitCode;
        process.exitCode = 0;
        await runDocsIndex({ target: "remote" });
        const code = process.exitCode === 0 ? 0 : 1;
        process.exitCode = before;
        return code;
      },
    });

    const deployArgs = [
      "--filter",
      "platform",
      "exec",
      "opennextjs-cloudflare",
      "deploy",
      "-e",
      tier,
    ];
    if (secretsFile) deployArgs.push("--secrets-file", secretsFile);

    steps.push({
      label: `Deploy platform (${tier})`,
      fn: () => pnpm(deployArgs, hyperdriveLocalAliasEnv()),
    });
  } else if (app === "schedule-builder") {
    const deployArgs = [
      "--filter",
      "schedule-builder",
      "exec",
      "opennextjs-cloudflare",
      "deploy",
      "-e",
      tier,
    ];
    if (secretsFile) deployArgs.push("--secrets-file", secretsFile);
    steps.push({
      label: `Deploy schedule-builder (${tier})`,
      fn: () => pnpm(deployArgs, hyperdriveLocalAliasEnv()),
    });
  } else {
    const deployArgs = [
      "--filter",
      "sandbox",
      "exec",
      "wrangler",
      "deploy",
      "-e",
      tier,
    ];
    if (secretsFile) deployArgs.push("--secrets-file", secretsFile);
    if (process.env.REST_URL) {
      deployArgs.push("--var", `PLATFORM_REST_URL:${process.env.REST_URL}`);
    }
    steps.push({
      label: `Deploy sandbox (${tier})`,
      fn: () => pnpm(deployArgs),
    });
  }

  if (dryRun) {
    say([
      `devtools-ci deploy ${app} --tier ${tier} --dry-run`,
      ...steps.map((s) => `  ${s.label}`),
    ]);
    return;
  }

  // require-token guard: checked inline so the step list above prints on
  // --dry-run without requiring the token.
  runRequireToken();

  for (const step of steps) {
    const code = await step.fn();
    if (code !== 0) {
      process.exitCode = code;
      return;
    }
  }
}

// ── Deploy dispatch ───────────────────────────────────────────────────────────

async function runDeployCommand(rest: string[]): Promise<void> {
  const [sub] = positionals(rest);

  if (!sub) {
    const steps = subcommandCiNames(["deploy"]);
    const width = Math.max(...steps.map((name) => name.length)) + 2;
    say([
      "devtools-ci deploy: which step or app?",
      ...steps.map(
        (name) =>
          `  ${name.padEnd(width)}${findCiCommand(["deploy", name])!.summary}`,
      ),
    ]);
    process.exitCode = 1;
    return;
  }

  // App orchestrators
  if (isApp(sub)) {
    await runAppDeploy(sub, rest.slice(1));
    return;
  }

  try {
    if (sub === "require-token") {
      runRequireToken();
      return;
    }

    if (sub === "require-planner") {
      await runRequirePlanner();
      return;
    }

    if (sub === "preflight") {
      await runPreflight();
      return;
    }

    if (sub === "mint-token") {
      runMintToken();
      return;
    }

    if (sub === "airtable-plan") {
      await runDeployAirtablePlan();
      return;
    }

    if (sub === "airtable-apply") {
      await runDeployAirtableApply();
      return;
    }

    await loadRegistry();

    if (sub === "write-env") {
      const index = rest.indexOf("--source");
      const source = index === -1 ? null : rest[index + 1];
      if (index !== -1 && (!source || source.startsWith("--"))) {
        throw new DeployError(
          "--source needs a manifest name, e.g. --source supabase.",
        );
      }
      const result = await runDeployWriteEnv({ source });
      say(renderWriteEnvReport(result));
      return;
    }

    if (sub === "secrets-file") {
      const app = flagValue(rest, "--app");
      if (!app) {
        throw new DeployError("--app <name> is required.", [
          "It names the workspace app whose manifest declares the Worker's",
          `secrets — ${WORKER_APPS.join(", ")}.`,
        ]);
      }
      const mintIndex = rest.indexOf("--mint");
      const after = mintIndex === -1 ? undefined : rest[mintIndex + 1];
      if (after !== undefined && !after.startsWith("--")) {
        throw new DeployError("`--mint` no longer takes a script path.", [
          `Drop the "${after}" after it. There is one minting command in this`,
          "repository — `devtools-ci deploy mint-token` — and this runs it;",
          "which variable it fills is derived from the app's manifest.",
        ]);
      }
      await runDeploySecretsFile({ app, mint: mintIndex !== -1 });
      return;
    }

    if (sub === "orphans") {
      await runDeployOrphans({ prune: rest.includes("--prune") });
      return;
    }

    say([`devtools-ci deploy: unknown subcommand "${sub}".`]);
    process.exitCode = 1;
  } catch (err) {
    say(
      err instanceof DeployError
        ? [
            `devtools-ci deploy ${sub}: ${err.message}`,
            ...err.detail.map((line) => `  ${line}`),
          ]
        : [`devtools-ci deploy ${sub}: ${err instanceof Error ? err.message : String(err)}`],
    );
    process.exitCode = 1;
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [first, ...rest] = argv;

  if (!first || first === "--help" || first === "-h") {
    const steps = subcommandCiNames(["deploy"]);
    const width = Math.max(...steps.map((name) => name.length)) + 2;
    process.stdout.write(
      [
        "devtools-ci <command>",
        "",
        "Commands:",
        `  ${"deploy".padEnd(width)}Deploy an app or run a deploy step.`,
        "",
        "Run `devtools-ci deploy` for the full step list.",
        "",
      ].join("\n"),
    );
    return;
  }

  if (first === "deploy") {
    await runDeployCommand(rest);
    return;
  }

  process.stderr.write(`devtools-ci: unknown command "${first}".\n`);
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`devtools-ci: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
