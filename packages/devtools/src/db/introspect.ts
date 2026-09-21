/**
 * `db introspect --app <slug>` — pull an app's live schema into its generated
 * Drizzle files, then apply post-pull fixups.
 *
 * Replicates the old `db:pull` package script chain:
 *   1. drizzle-kit pull --config drizzle-introspection.config.ts  (auth/storage schemas)
 *   2. drizzle-kit pull --config drizzle.config.ts                (platform schema)
 *   3. Post-pull fixups on the generated schema.ts:
 *      a. Delete relations.ts (we maintain hand-written relations)
 *      b. Re-inject the cross-schema FK-target import (auth.users etc.)
 *      c. Append InPlatform-suffix aliases so existing imports stay stable
 *
 * `DB_URL` comes from `resolveLocalToolingEnv` — the tier this process
 * already entered (`launch.ts`, before `cli.ts` ever dispatched this
 * command), `.env.generated` overlay included — and is injected into the
 * subprocess environment. See `db/local-env.ts`'s header for why this is
 * NOT a raw `.env` parse.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "../environment.js";
import { resolveLocalToolingEnv } from "./local-env.js";

// ── Per-app config ────────────────────────────────────────────────────────────

interface AppIntrospectConfig {
  // Drizzle config files to pull, in order
  configs: string[];
  // The generated schema file that receives post-pull fixups
  schemaFile: string;
  // Whether to apply the InPlatform suffix aliases
  schemaSuffix: string | null;
  // Cross-schema FK import line to re-inject (null = skip step)
  crossSchemaImport: string | null;
}

const APP_CONFIGS: Record<string, AppIntrospectConfig> = {
  platform: {
    configs: ["drizzle-introspection.config.ts", "drizzle.config.ts"],
    schemaFile: "src/server/db/schema/generated/schema.ts",
    schemaSuffix: "InPlatform",
    crossSchemaImport:
      'import { usersInAuth as users, oauthClientsInAuth as oauthClients } from "~/supabase/drizzle/schema"',
  },
};

// ── drizzle-kit pull ──────────────────────────────────────────────────────────

function runDrizzlePull(
  appDir: string,
  configFile: string,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      ["exec", "drizzle-kit", "pull", "--config", configFile],
      { stdio: "inherit", cwd: appDir, env },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

// ── Post-pull fixups ──────────────────────────────────────────────────────────

function applyPostPullFixups(appDir: string, cfg: AppIntrospectConfig): void {
  const schemaPath = join(appDir, cfg.schemaFile);
  const relationsPath = join(
    appDir,
    cfg.schemaFile.replace("schema.ts", "relations.ts"),
  );

  // 1. Delete relations.ts
  if (existsSync(relationsPath)) rmSync(relationsPath);

  if (!existsSync(schemaPath)) return;
  let src = readFileSync(schemaPath, "utf8");

  // 2. Re-inject cross-schema FK-target import (idempotent)
  const IMPORT_MARKER = "// Cross-schema FK targets";
  if (cfg.crossSchemaImport && !src.includes(IMPORT_MARKER)) {
    const lines = src.split("\n");
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.startsWith("import ") && line.includes("drizzle-orm")) {
        insertAt = i + 1;
      } else if (line.trim() !== "" && !line.startsWith("import ")) {
        break;
      }
    }
    lines.splice(
      insertAt,
      0,
      `${IMPORT_MARKER} — re-injected by devtools db introspect after each drizzle-kit pull`,
      cfg.crossSchemaImport,
    );
    src = lines.join("\n");
  }

  // 3. Append base-name aliases for every `<name><suffix>` export (idempotent)
  const ALIAS_MARKER = "// Schema-suffix aliases";
  if (cfg.schemaSuffix && !src.includes(ALIAS_MARKER)) {
    const names = new Set<string>();
    const re = new RegExp(`export const (\\w+)${cfg.schemaSuffix}\\b`, "g");
    for (const m of src.matchAll(re)) if (m[1]) names.add(m[1]);
    if (names.size > 0) {
      const aliases = [...names]
        .sort()
        .map((n) => `export { ${n}${cfg.schemaSuffix} as ${n} };`)
        .join("\n");
      src = `${src.trimEnd()}\n\n${ALIAS_MARKER} — appended by devtools db introspect\n${aliases}\n`;
    }
  }

  writeFileSync(schemaPath, src);
  process.stdout.write(`[introspect] patched ${cfg.schemaFile}\n`);
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function runIntrospect(app?: string): Promise<number> {
  if (!app) {
    process.stderr.write("devtools db introspect: --app <slug> is required.\n");
    return 1;
  }

  const cfg = APP_CONFIGS[app];
  if (!cfg) {
    const valid = Object.keys(APP_CONFIGS).join(", ");
    process.stderr.write(
      `devtools db introspect: unknown app "${app}". Expected: ${valid}.\n`,
    );
    return 1;
  }

  const appDir = join(PROJECT_ROOT, "apps", app);

  const env = await resolveLocalToolingEnv();

  if (!env["DB_URL"]) {
    process.stderr.write(
      "devtools db introspect: DB_URL is not set. Run " +
        "`pnpm devtools db start` first (for local — its connection string " +
        "lives in .env.generated once the stack is up), or set DB_URL in " +
        "the deploy tier's env file this process entered.\n",
    );
    return 1;
  }

  for (const configFile of cfg.configs) {
    const code = await runDrizzlePull(appDir, configFile, env);
    if (code !== 0) return code;
  }

  applyPostPullFixups(appDir, cfg);
  return 0;
}
