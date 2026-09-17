/**
 * Dispatch for `devtools cf *`.
 *
 * Delegates to each app's package scripts for preview/typegen/build, and
 * passes through to wrangler for `cf exec`.
 */
import { run } from "../db/run.js";
import { createTemporaryWranglerEnv } from "./local-env.js";

const CF_APPS = new Set(["platform", "schedule-builder", "sandbox"]);

function parseAppAndRest(argv: readonly string[]): { app?: string; rest: readonly string[] } {
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
    if (!CF_APPS.has(app)) {
      process.stderr.write(`devtools cf preview: unknown app "${app}". Expected: platform, schedule-builder, sandbox.\n`);
      return 1;
    }
    if (app === "sandbox") {
      const runtimeEnv = await createTemporaryWranglerEnv(app);
      try {
        return run([
          "--filter",
          app,
          "exec",
          "wrangler",
          "dev",
          "--env-file",
          runtimeEnv.path,
        ]);
      } finally {
        runtimeEnv.remove();
      }
    }

    const build = await run([
      "--filter",
      app,
      "exec",
      "opennextjs-cloudflare",
      "build",
    ]);
    if (build !== 0) return build;

    // Create this after the framework build. Apart from shortening the time a
    // credential-bearing file exists, this prevents build-tool temp cleanup
    // from invalidating the path before Wrangler opens it.
    const runtimeEnv = await createTemporaryWranglerEnv(app);
    try {
      // OpenNext's preview wrapper intentionally disables Wrangler's own env
      // file loading, so process.env reaches its cache-population phase but
      // not the Worker runtime. The bundle is already built above; invoke the
      // project's Wrangler directly so the scoped file becomes Worker vars.
      return run([
        "--filter",
        app,
        "exec",
        "wrangler",
        "dev",
        "--env-file",
        runtimeEnv.path,
      ]);
    } finally {
      runtimeEnv.remove();
    }
  }

  if (sub === "typegen") {
    const { app, rest: remaining } = parseAppAndRest(rest);
    if (!app) {
      process.stderr.write("devtools cf typegen: --app <slug> is required.\n");
      return 1;
    }
    if (!CF_APPS.has(app)) {
      process.stderr.write(`devtools cf typegen: unknown app "${app}". Expected: platform, schedule-builder, sandbox.\n`);
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
    if (!CF_APPS.has(app)) {
      process.stderr.write(`devtools cf build: unknown app "${app}". Expected: platform, schedule-builder, sandbox.\n`);
      return 1;
    }
    if (!tier || (tier !== "staging" && tier !== "production")) {
      process.stderr.write("devtools cf build: --tier <staging|production> is required.\n");
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
