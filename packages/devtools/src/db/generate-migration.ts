/**
 * `db migration generate [--app <slug>]` — draft a migration from an app's
 * Drizzle schema drift.
 *
 * Absorbs schedule-builder's `db:generate` package script (`with-env
 * drizzle-kit generate --config drizzle-migrations.config.ts`), the same way
 * `db introspect` absorbed platform's `db:pull`. It touches no database: it
 * diffs the schema files against drizzle-kit's own snapshot and writes SQL
 * under the app's `drizzle-generated/`, a draft to be carried by hand into a
 * real migration under `supabase/migrations/` — never something that runs on
 * its own. `DB_URL` is still required because drizzle-kit's Postgres
 * introspection needs a live connection to compare against, matching what
 * `with-env` supplied before.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { select } from "@clack/prompts";
import { parse as parseEnv } from "dotenv";
import { fileFor } from "@devdogsuga/env";
import { PROJECT_ROOT } from "../environment.js";
import { unwrap } from "../ui.js";

// ── Per-app config ────────────────────────────────────────────────────────────

/** Apps whose Drizzle schema drafts migrations via `drizzle-kit generate`. */
const APP_CONFIGS: Record<string, string> = {
  "schedule-builder": "drizzle-migrations.config.ts",
};

async function pickApp(): Promise<string> {
  const names = Object.keys(APP_CONFIGS);
  if (names.length === 1) return names[0]!;
  return unwrap(
    await select({
      message: "Whose schema drift should I draft a migration from?",
      options: names.map((value) => ({ value, label: value })),
    }),
  );
}

function runDrizzleGenerate(
  appDir: string,
  configFile: string,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      ["exec", "drizzle-kit", "generate", "--config", configFile],
      { stdio: "inherit", cwd: appDir, env },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function runGenerateMigration(appSlug?: string): Promise<number> {
  const app = appSlug ?? (await pickApp());

  const configFile = APP_CONFIGS[app];
  if (!configFile) {
    const valid = Object.keys(APP_CONFIGS).join(", ");
    process.stderr.write(
      `devtools db migration generate: unknown app "${app}". Expected: ${valid}.\n`,
    );
    return 1;
  }

  const appDir = join(PROJECT_ROOT, "apps", app);

  // Load DB_URL from the dev env file, matching `db introspect`'s approach:
  // `pnpm devtools` is itself `with-env tsx src/cli.ts`, but drizzle-kit here
  // runs as its own child process in the app's directory, so it needs the
  // connection string injected explicitly rather than inherited implicitly.
  const envFile = join(PROJECT_ROOT, fileFor("development"));
  const tierEnv = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, "utf8"))
    : {};
  const env: NodeJS.ProcessEnv = { ...process.env, ...tierEnv };

  if (!env["DB_URL"]) {
    process.stderr.write(
      "devtools db migration generate: DB_URL is not set in .env. " +
        "Run `pnpm devtools db start` first (for local) or set DB_URL to the remote connection string.\n",
    );
    return 1;
  }

  return runDrizzleGenerate(appDir, configFile, env);
}
