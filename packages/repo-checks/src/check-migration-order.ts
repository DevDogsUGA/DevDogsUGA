#!/usr/bin/env tsx
/**
 * CI entry point for `migration-order.ts`'s pure check: reads the two file
 * lists it needs from git and exits non-zero with a readable message when a
 * newly added `supabase/migrations/` file sorts before the base branch's
 * newest one. See that module for why this matters.
 *
 * Usage: `tsx src/check-migration-order.ts <base-ref>`. `<base-ref>` is
 * whatever the caller already resolved as the comparison point — the CI
 * workflow's own "Determine base ref" step output, so this script does not
 * duplicate that ref-resolution logic (a pull request's base branch tip vs. a
 * push's pre-push `HEAD`; see `.github/workflows/ci.yaml`).
 */
import { execFileSync } from "node:child_process";
import { PROJECT_ROOT } from "./project-root.js";
import {
  findOutOfOrderMigrations,
  latestMigrationTimestamp,
} from "./migration-order.js";

const MIGRATIONS_DIR = "supabase/migrations";

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  }).trim();
}

function listFiles(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => path.split("/").at(-1)!);
}

function main() {
  // pnpm 11 forwards a `--` separator to the script instead of consuming it.
  const baseRef = process.argv.slice(2).find((arg) => arg !== "--");
  if (!baseRef) {
    console.error("usage: check-migration-order <base-ref>");
    process.exit(2);
  }

  // The base branch's own migration files, from its tree at that ref — not
  // "everything on disk before this PR's changes", because a local checkout
  // may already have this PR's added files merged into the working tree.
  const baseFiles = listFiles(
    git(["ls-tree", "-r", "--name-only", baseRef, "--", MIGRATIONS_DIR]),
  );

  // Files this branch adds under the directory, relative to the merge base —
  // `--diff-filter=A` so a rename or an edit to an existing migration (both
  // legitimate; only a genuinely NEW file can be timestamped into the past)
  // does not trip this.
  const addedFiles = listFiles(
    git([
      "diff",
      "--name-only",
      "--diff-filter=A",
      `${baseRef}...HEAD`,
      "--",
      MIGRATIONS_DIR,
    ]),
  );

  const baseLatest = latestMigrationTimestamp(baseFiles);
  const violations = findOutOfOrderMigrations(addedFiles, baseLatest);

  if (violations.length === 0) {
    console.log(
      `Migrations are in order (base ${baseRef}'s newest: ${baseLatest ?? "none"}).`,
    );
    return;
  }

  console.error(
    `${violations.length} new migration(s) are timestamped before ${baseRef}'s newest migration (${baseLatest}):`,
  );
  for (const violation of violations) {
    console.error(`  ${violation.filename} (${violation.timestamp})`);
  }
  console.error(
    "Recreate the file with a fresh timestamp (`pnpm devtools db migration new`) and regenerate types.",
  );
  process.exit(1);
}

main();
