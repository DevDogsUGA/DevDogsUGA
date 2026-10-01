/**
 * `types:drizzle` for the Worker apps: pull the live schema into the app's
 * generated Drizzle files, then apply the post-pull fixups.
 *
 * Run from an app directory through `with-env`, which supplies `DB_URL` for the
 * tier the session points at (local by default):
 *
 *   with-env tsx ../../scripts/drizzle-pull.ts
 *
 * Steps:
 *   1. drizzle-kit pull --config drizzle-introspection.config.ts  (auth/storage)
 *   2. drizzle-kit pull --config drizzle.config.ts                (app schema)
 *   3. Fixups on the generated schema.ts:
 *      a. delete relations.ts (the hand-written relations are the real ones)
 *      b. re-inject the cross-schema FK-target import (auth.users etc.)
 *      c. append base-name aliases for every `<name><Suffix>` export
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

interface AppConfig {
  /** Drizzle config files to pull, in order. */
  configs: string[];
  /** The generated schema file that receives the fixups. */
  schemaFile: string;
  /** Suffix Drizzle appends to this app's schema exports. */
  schemaSuffix: string;
  /** Cross-schema FK import line to re-inject, or null to skip the step. */
  crossSchemaImport: string | null;
}

const APPS: Record<string, AppConfig> = {
  platform: {
    configs: ["drizzle-introspection.config.ts", "drizzle.config.ts"],
    schemaFile: "src/server/db/schema/generated/schema.ts",
    schemaSuffix: "InPlatform",
    crossSchemaImport:
      'import { usersInAuth as users, oauthClientsInAuth as oauthClients } from "~/supabase/drizzle/schema"',
  },
  "schedule-builder": {
    configs: ["drizzle-introspection.config.ts", "drizzle.config.ts"],
    schemaFile: "src/server/db/schema/generated/schema.ts",
    schemaSuffix: "InScheduleBuilder",
    // schedule_builder's tables carry no foreign keys into another schema (its
    // `userId` columns are bare uuids), so there is nothing to re-inject.
    crossSchemaImport: null,
  },
};

const IMPORT_MARKER = "// Cross-schema FK targets";
const ALIAS_MARKER = "// Schema-suffix aliases";

function applyFixups(appDir: string, cfg: AppConfig): void {
  const schemaPath = join(appDir, cfg.schemaFile);
  const relationsPath = join(
    appDir,
    cfg.schemaFile.replace("schema.ts", "relations.ts"),
  );
  if (existsSync(relationsPath)) rmSync(relationsPath);
  if (!existsSync(schemaPath)) return;

  let src = readFileSync(schemaPath, "utf8");

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
      `${IMPORT_MARKER} — re-injected by types:drizzle after each drizzle-kit pull`,
      cfg.crossSchemaImport,
    );
    src = lines.join("\n");
  }

  if (!src.includes(ALIAS_MARKER)) {
    const names = new Set<string>();
    const re = new RegExp(`export const (\\w+)${cfg.schemaSuffix}\\b`, "g");
    for (const m of src.matchAll(re)) if (m[1]) names.add(m[1]);
    if (names.size > 0) {
      const aliases = [...names]
        .sort()
        .map((n) => `export { ${n}${cfg.schemaSuffix} as ${n} };`)
        .join("\n");
      src = `${src.trimEnd()}\n\n${ALIAS_MARKER} — appended by types:drizzle\n${aliases}\n`;
    }
  }

  writeFileSync(schemaPath, src);
  console.log(`[types:drizzle] patched ${cfg.schemaFile}`);
}

const appDir = process.cwd();
const cfg = APPS[basename(appDir)];
if (!cfg) {
  console.error(
    `types:drizzle: run it from an app directory (${Object.keys(APPS).join(", ")}).`,
  );
  process.exit(1);
}
if (!process.env["DB_URL"]) {
  console.error(
    "types:drizzle: DB_URL is not set. Start the local database (pnpm devtools supabase start), or run it through with-env.",
  );
  process.exit(1);
}

for (const config of cfg.configs) {
  const result = spawnSync(
    "pnpm",
    ["exec", "drizzle-kit", "pull", "--config", config],
    { stdio: "inherit", cwd: appDir, env: process.env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
applyFixups(appDir, cfg);
