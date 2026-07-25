/**
 * One-command onboarding: `pnpm setup`.
 *
 * Checks prerequisites (warns, never hard-fails on optional tools), seeds the
 * root .env from the example, and points the contributor at the next step.
 * Deliberately does NOT run remote Supabase commands for you — linking a remote
 * project needs your credentials in .env first.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m: string) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const info = (m: string) => console.log(`  \x1b[36m→\x1b[0m ${m}`);

function has(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

console.log("\nDevDogs monorepo setup\n");

// --- Prerequisites ---------------------------------------------------------
const node = process.versions.node;
if (Number(node.split(".")[0]) >= 20) ok(`Node ${node}`);
else warn(`Node ${node} — this repo needs >= 20 (see .nvmrc)`);

if (has("corepack --version")) ok("corepack available");
else warn("corepack not found — run `corepack enable` for the pinned pnpm");

if (has("docker info")) ok("Docker running (local Supabase stack available)");
else
  info(
    "Docker not running — fine for remote-first dev; needed for `pnpm sb start-local-stack`",
  );

if (has("flutter --version"))
  ok("Flutter installed (study-group-finder buildable)");
else info("Flutter not installed — only needed for apps/study-group-finder");

// --- Env -------------------------------------------------------------------
const env = join(root, ".env");
if (existsSync(env)) {
  ok(".env already exists (left untouched)");
} else {
  copyFileSync(join(root, ".env.example"), env);
  ok("created .env from .env.example");
  warn("fill in the Remote Supabase project section of .env before `pnpm dev`");
}

// --- Next steps ------------------------------------------------------------
console.log("\nNext steps:");
info(
  "1. Edit .env — add your remote Supabase creds (dashboard > Project Settings)",
);
info(
  "2. pnpm sb link-remote-project   # one-time, links the CLI to the project",
);
info("3. pnpm sb generate-types        # regenerate the shared Database types");
info(
  "4. pnpm dev --filter @devdogsuga/platform   # (or dev:local for the Docker stack)",
);
console.log("");
