/**
 * Post-processing for `drizzle-kit pull` (run at the end of `db:pull`).
 * Replaces the old inline `sed` hack from package.json.
 *
 * 1. Deletes the `relations.ts` drizzle emits (we maintain relations by hand
 *    in `src/server/db/relations.ts`).
 * 2. Re-injects the cross-schema FK-target import that drizzle can't resolve
 *    on its own — `auth.users` / `auth.oauth_clients`, which live in the
 *    introspected `~/supabase/drizzle/schema` module.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const GENERATED_DIR = "src/server/db/schema/generated";
const SCHEMA_FILE = join(GENERATED_DIR, "schema.ts");
const RELATIONS_FILE = join(GENERATED_DIR, "relations.ts");

const MARKER = "// Cross-schema FK targets";
const CROSS_SCHEMA_IMPORT =
  'import { usersInAuth as users, oauthClientsInAuth as oauthClients } from "~/supabase/drizzle/schema"';

// 1. Drop the unused generated relations file.
if (existsSync(RELATIONS_FILE)) rmSync(RELATIONS_FILE);

// 2. Re-inject the cross-schema import (idempotent).
let src = readFileSync(SCHEMA_FILE, "utf8");
if (!src.includes(MARKER)) {
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
    `${MARKER} — re-injected by scripts/post-pull.ts after each drizzle-kit pull`,
    CROSS_SCHEMA_IMPORT,
  );
  src = lines.join("\n");
  writeFileSync(SCHEMA_FILE, src);
}

console.log("[post-pull] patched generated drizzle schema");
