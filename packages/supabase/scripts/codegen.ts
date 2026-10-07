/**
 * `codegen`: write `src/database.types.ts` from the local database, unless it
 * is already current.
 *
 * The file is not committed (it is gitignored, so a migration PR carries no
 * regenerated wall of types to review or merge-conflict on). Instead it is a
 * pure function of `supabase/migrations/**`: this hashes those files, compares
 * the hash with the stamp left beside the last output, and does nothing when
 * they match. A stale or missing file is regenerated with
 * `supabase gen types --db-url "$DB_URL"` through `with-env` (the same call the
 * old `types:db` script made), formatted, and stamped.
 *
 * Generation needs the local stack running with every migration applied:
 *
 *   pnpm devtools supabase start --tier development:local
 *
 * Backstage runs this same script in its DevDogsUGA sibling
 * (`pnpm --filter @devdogsuga/supabase run codegen`), so the script name and
 * the output path are a contract. So is `BACKSTAGE_SUPABASE_TYPES`, which
 * Backstage's CI sets where there is no database to generate from:
 *
 *   skip      generate nothing: the credential-free deploy build, where every
 *             import of the type is erased (schedule-builder's `prebuild`
 *             runs this).
 *   provided  CI restored the file from its cache; use it as it is.
 *
 * Caveat: the stamp covers the migrations, not the database. A stack that was
 * started before you pulled new migrations yields types for the old schema
 * under the new hash. If generated types look wrong, run
 * `pnpm devtools supabase db reset` (or `supabase start` on a fresh volume),
 * delete `src/.database.types.hash`, and run `codegen` again.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(packageDir, "..", "..", "supabase", "migrations");
const output = join(packageDir, "src", "database.types.ts");
const stampFile = join(packageDir, "src", ".database.types.hash");

/** sha256 over every migration's relative path and content, in sorted order. */
export function hashMigrations(dir: string): string {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).split("\\").join("/"),
    )
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(join(dir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function fail(message: string, cleanup?: string): never {
  // process.exit skips `finally`, so the caller's temp file is removed here.
  if (cleanup) rmSync(cleanup, { force: true });
  console.error(`\n@devdogsuga/supabase codegen: ${message}\n`);
  process.exit(1);
}

function main(): void {
  const mode = process.env.BACKSTAGE_SUPABASE_TYPES;
  if (mode === "skip" || (mode === "provided" && existsSync(output))) {
    console.log(
      `database.types.ts: BACKSTAGE_SUPABASE_TYPES=${mode}, not generating.`,
    );
    return;
  }

  const hash = hashMigrations(migrationsDir);
  if (
    existsSync(output) &&
    existsSync(stampFile) &&
    readFileSync(stampFile, "utf8").trim() === hash
  ) {
    console.log("database.types.ts is current for these migrations.");
    return;
  }

  // Unique per process: `pnpm -r` can run several packages' pre-scripts at once.
  const tmp = join(packageDir, "src", `.database.types.${process.pid}.tmp.ts`);
  try {
    const gen = spawnSync(
      "pnpm",
      [
        "exec",
        "with-env",
        "-c",
        `supabase gen types --db-url "$DB_URL" > "${relative(process.cwd(), tmp)}"`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        shell: false,
        // The types come from the LOCAL database, whatever else the checkout
        // holds: with `.env.staging` or `.env.production` beside `.env`,
        // `with-env` refuses to guess a tier and this failed with a message
        // about the stack instead.
        env: { ...process.env, DEPLOY_ENV: "development" },
      },
    );
    if (gen.status !== 0) {
      process.stderr.write(gen.stderr ?? "");
      fail(
        "could not generate src/database.types.ts from the local database\n" +
          "(the error above says why). If the local stack is not running, start it\n" +
          "and run this again:\n\n" +
          "  pnpm devtools supabase start --tier development:local\n\n" +
          "(`with-env` also needs a root .env: `pnpm devtools env init`.)",
        tmp,
      );
    }
    // The file is gitignored, which prettier would otherwise honor and skip.
    const format = spawnSync(
      "pnpm",
      [
        "exec",
        "prettier",
        "--write",
        "--ignore-path",
        join(packageDir, ".no-ignore"),
        tmp,
      ],
      { cwd: packageDir, encoding: "utf8" },
    );
    if (format.status !== 0) {
      process.stderr.write(format.stderr ?? "");
      fail("prettier failed on the generated types.", tmp);
    }
    renameSync(tmp, output);
    writeFileSync(stampFile, `${hash}\n`);
    console.log("Wrote src/database.types.ts.");
  } finally {
    rmSync(tmp, { force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
