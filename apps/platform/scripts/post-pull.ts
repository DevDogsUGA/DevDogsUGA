/**
 * Post-processing for `drizzle-kit pull` (run at the end of `db:pull`).
 *
 * 1. Deletes the `relations.ts` drizzle emits. We maintain relations by hand
 *    in `src/server/db/relations.ts`.
 * 2. Re-injects the cross-schema FK-target import drizzle cannot resolve on
 *    its own: `auth.users` / `auth.oauth_clients`, which live in the
 *    introspected `~/supabase/drizzle/schema` module.
 * 3. Aliases the schema-suffixed exports drizzle emits for a non-public schema
 *    (`profileInPlatform` → `profile`) so the app's imports stay stable.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const GENERATED_DIR = "src/server/db/schema/generated";
const SCHEMA_FILE = join(GENERATED_DIR, "schema.ts");
const RELATIONS_FILE = join(GENERATED_DIR, "relations.ts");

// drizzle-kit suffixes non-public-schema exports with the camel-cased schema
// name; for the `platform` schema that's `InPlatform`.
const SCHEMA_SUFFIX = "InPlatform";

const IMPORT_MARKER = "// Cross-schema FK targets";
const CROSS_SCHEMA_IMPORT =
  'import { usersInAuth as users, oauthClientsInAuth as oauthClients } from "~/supabase/drizzle/schema"';
const ALIAS_MARKER = "// Schema-suffix aliases";

// 1. Drop the unused generated relations file.
if (existsSync(RELATIONS_FILE)) rmSync(RELATIONS_FILE);

let src = readFileSync(SCHEMA_FILE, "utf8");

// 2. Re-inject the cross-schema import (idempotent).
if (!src.includes(IMPORT_MARKER)) {
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
    `${IMPORT_MARKER} — re-injected by scripts/post-pull.ts after each drizzle-kit pull`,
    CROSS_SCHEMA_IMPORT,
  );
  src = lines.join("\n");
}

// 3. Append base-name aliases for every `<name>InPlatform` export so the app
//    can keep importing `profile`, `roles`, etc. (idempotent).
if (!src.includes(ALIAS_MARKER)) {
  const names = new Set<string>();
  const re = new RegExp(`export const (\\w+)${SCHEMA_SUFFIX}\\b`, "g");
  for (const m of src.matchAll(re)) if (m[1]) names.add(m[1]);
  if (names.size > 0) {
    const aliases = [...names]
      .map((n) => `export { ${n}${SCHEMA_SUFFIX} as ${n} };`)
      .join("\n");
    src = `${src.trimEnd()}\n\n${ALIAS_MARKER} — appended by scripts/post-pull.ts\n${aliases}\n`;
  }
}

writeFileSync(SCHEMA_FILE, src);
console.log("[post-pull] patched generated drizzle schema");
