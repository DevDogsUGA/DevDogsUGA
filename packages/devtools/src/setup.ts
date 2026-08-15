/**
 * One-command onboarding, and the first thing a new contributor runs.
 *
 * Checks prerequisites (warns, never hard-fails on optional tools), seeds the
 * root `.env` from the example, and points at the next step. Deliberately does
 * NOT run remote Supabase commands: linking a remote project needs credentials
 * that are not in `.env` yet.
 *
 * Was `scripts/setup.ts` at the repo root, resolving paths from `process.cwd()`
 * -- so it only worked when invoked from the root, which is the same class of
 * bug that made the Supabase CLI look for `supabase_db_platform`. It resolves
 * from `PROJECT_ROOT` now and works from anywhere.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { log, note } from "@clack/prompts";
import { PROJECT_ROOT } from "./instance.js";

function has(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

export function runSetup(): void {
  const checks: string[] = [];

  // ── Prerequisites ──────────────────────────────────────────────────────────
  //
  // Optional tools report as information rather than warnings. A contributor
  // without Flutter is not misconfigured; they are just not working on the
  // Flutter app, and saying otherwise trains people to ignore the output.

  const node = process.versions.node;
  checks.push(
    Number(node.split(".")[0]) >= 20
      ? `OK    Node ${node}`
      : `WARN  Node ${node} — this repo needs >= 20 (see .nvmrc)`,
  );

  checks.push(
    has("corepack --version")
      ? "OK    corepack available"
      : "WARN  corepack not found — run `corepack enable` for the pinned pnpm",
  );

  checks.push(
    has("docker info")
      ? "OK    Docker running (local Supabase stack available)"
      : "INFO  Docker not running — fine against a hosted project, needed for a local stack",
  );

  checks.push(
    has("flutter --version")
      ? "OK    Flutter installed (study-group-finder buildable)"
      : "INFO  Flutter not installed — only needed for apps/study-group-finder",
  );

  // ── Env ────────────────────────────────────────────────────────────────────

  const env = join(PROJECT_ROOT, ".env");
  let seededEnv = false;
  if (existsSync(env)) {
    checks.push("OK    .env already exists (left untouched)");
  } else {
    copyFileSync(join(PROJECT_ROOT, ".env.example"), env);
    checks.push("OK    created .env from .env.example");
    seededEnv = true;
  }

  note(checks.join("\n"), "Prerequisites");

  if (seededEnv) {
    log.warn(
      "Fill in the Remote Supabase project section of .env before `pnpm dev`.",
    );
  }

  note(
    [
      "1. Edit .env — add your remote Supabase creds",
      "   (Supabase dashboard → Project Settings)",
      "",
      "2. Run `pnpm devtools` again and choose:",
      "     Start my database   — for the local Docker stack",
      "",
      "3. pnpm dev --filter platform",
      "",
      "Working against the linked remote project instead?",
      "  pnpm devtools link --remote",
      "  pnpm --filter @devdogsuga/supabase generate-types",
    ].join("\n"),
    "Next steps",
  );
}
