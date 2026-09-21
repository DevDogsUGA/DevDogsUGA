/**
 * Dispatch for `devtools cf *`.
 *
 * Delegates to each app's package scripts for preview/typegen/build, and
 * passes through to wrangler for `cf exec`.
 */
import { confirm } from "@clack/prompts";
import { MissingEnvFileError, loadEnvironment } from "@devdogsuga/env/load";
import { run } from "../db/run.js";
import { resolveTier } from "../tier.js";
import { unwrap } from "../ui.js";
import { isWorkerApp, WORKER_APPS } from "../workers.js";
import { withWranglerEnv } from "./local-env.js";

const UNKNOWN_APP_HINT = `Expected: ${WORKER_APPS.join(", ")}.`;

function parseAppAndRest(argv: readonly string[]): {
  app?: string;
  rest: readonly string[];
} {
  const idx = argv.indexOf("--app");
  if (idx === -1 || idx + 1 >= argv.length) return { rest: argv };
  const app = argv[idx + 1];
  const rest = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
  return { app, rest };
}

function parseTier(argv: readonly string[]): string | undefined {
  const idx = argv.indexOf("--tier");
  return idx !== -1 ? argv[idx + 1] : undefined;
}

export async function runCf(argv: readonly string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);

  if (sub === "preview") {
    const { app } = parseAppAndRest(rest);
    if (!app) {
      process.stderr.write("devtools cf preview: --app <slug> is required.\n");
      return 1;
    }
    if (!isWorkerApp(app)) {
      process.stderr.write(
        `devtools cf preview: unknown app "${app}". ${UNKNOWN_APP_HINT}\n`,
      );
      return 1;
    }

    // The command tree's own `--tier` option carries no `prompt` (see
    // `commands.ts`): asking there AND here would ask twice, once on its own
    // wizard screen and once from this resolver, whenever more than one tier
    // file is present. `resolveTier` owns both the validation an explicit
    // `--tier` needs and the conditional prompt an absent one gets.
    const tier = await resolveTier(
      parseTier(rest),
      "Which tier's env should the preview use?",
      { label: "devtools cf preview" },
    );
    if (tier === null) return 1;

    // Previewing production means the local Worker talks to live production
    // data (DB_URL, third-party API keys, the lot) from a developer's own
    // machine — the same exposure `cron run`/`workflows run` gate behind a
    // confirm for a deployed TIER. Staging carries no such weight; it is a
    // normal development target and asks for nothing extra.
    if (tier === "production" && !rest.includes("--yes")) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          "devtools cf preview: --yes is required to preview production.\n",
        );
        return 1;
      }
      const approved = unwrap(
        await confirm({
          message: `Preview ${app} against live production data?`,
          initialValue: false,
        }),
      );
      if (!approved) return 1;
    }

    let loaded: Awaited<ReturnType<typeof loadEnvironment>> | undefined;
    if (tier !== "development") {
      try {
        // This process runs under `with-env` (development), so process.env
        // already holds development's values; override: true makes the
        // tier's own .env.<tier> win instead of quietly previewing against
        // whatever development happened to have loaded.
        loaded = await loadEnvironment(tier, { override: true });
      } catch (err) {
        // `err.message` already names the fetch command (see
        // `MissingEnvFileError`'s constructor); repeating it here would just
        // duplicate the line.
        if (err instanceof MissingEnvFileError) {
          process.stderr.write(`devtools cf preview: ${err.message}\n`);
          return 1;
        }
        throw err;
      }
    }

    if (app === "sandbox") {
      // No build step for the sandbox app: the tier only needs to reach
      // Wrangler's materialized `--env-file`, below.
      return withWranglerEnv(
        app,
        (envFile) =>
          run([
            "--filter",
            app,
            "exec",
            "wrangler",
            "dev",
            "--env-file",
            envFile,
          ]),
        { env: loaded?.env },
      );
    }

    // The build bakes tier-scoped values (NEXT_PUBLIC_* and anything else
    // read at build time) into the bundle, exactly like `cf:build:<tier>`'s
    // `DEPLOY_ENV=<tier> with-env` does — so it gets both the tier's loaded
    // env AND DEPLOY_ENV itself, since build-time code may branch on that
    // variable directly. The `wrangler dev` child below does NOT: the tier
    // reaches the Worker at RUNTIME through the scoped `--env-file`
    // `withWranglerEnv` materializes, not through this process's own
    // environment, so passing DEPLOY_ENV there would be a no-op at best and a
    // stale value baked nowhere at worst.
    const build = await run(
      ["--filter", app, "exec", "opennextjs-cloudflare", "build"],
      tier && loaded ? { ...loaded.env, DEPLOY_ENV: tier } : undefined,
    );
    if (build !== 0) return build;

    // Create this after the framework build. Apart from shortening the time a
    // credential-bearing file exists, this prevents build-tool temp cleanup
    // from invalidating the path before Wrangler opens it.
    return withWranglerEnv(
      app,
      (envFile) =>
        // OpenNext's preview wrapper intentionally disables Wrangler's own env
        // file loading, so process.env reaches its cache-population phase but
        // not the Worker runtime. The bundle is already built above; invoke the
        // project's Wrangler directly so the scoped file becomes Worker vars.
        run([
          "--filter",
          app,
          "exec",
          "wrangler",
          "dev",
          "--env-file",
          envFile,
        ]),
      { env: loaded?.env },
    );
  }

  if (sub === "typegen") {
    const { app, rest: remaining } = parseAppAndRest(rest);
    if (!app) {
      process.stderr.write("devtools cf typegen: --app <slug> is required.\n");
      return 1;
    }
    if (!isWorkerApp(app)) {
      process.stderr.write(
        `devtools cf typegen: unknown app "${app}". ${UNKNOWN_APP_HINT}\n`,
      );
      return 1;
    }
    const check = remaining.includes("--check");
    const script = check ? "cf:typegen:check" : "cf:typegen";
    return run(["--filter", app, "run", script]);
  }

  if (sub === "build") {
    const { app } = parseAppAndRest(rest);
    const tier = parseTier(rest);
    if (!app) {
      process.stderr.write("devtools cf build: --app <slug> is required.\n");
      return 1;
    }
    if (!isWorkerApp(app)) {
      process.stderr.write(
        `devtools cf build: unknown app "${app}". ${UNKNOWN_APP_HINT}\n`,
      );
      return 1;
    }
    if (!tier || (tier !== "staging" && tier !== "production")) {
      process.stderr.write(
        "devtools cf build: --tier <staging|production> is required.\n",
      );
      return 1;
    }
    return run(["--filter", app, "run", `cf:build:${tier}`]);
  }

  if (sub === "exec") {
    // Everything after "exec" (or after "--") passes to wrangler
    const wranglerArgs = rest[0] === "--" ? rest.slice(1) : rest;
    return run(["exec", "wrangler", ...wranglerArgs]);
  }

  process.stderr.write(
    `devtools cf: unknown subcommand "${sub ?? "(none)"}". ` +
      "Expected: preview, typegen, build, exec.\n",
  );
  return 1;
}
