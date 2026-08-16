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
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log, note } from "@clack/prompts";
import { loadRegistry } from "./env/discovery.js";
import { renderInit } from "./env/example.js";
import { PROJECT_ROOT } from "./instance.js";

function has(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

export async function runSetup(): Promise<void> {
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

  // Seeded from the SAME renderer as `env init` and the generated
  // .env.example, rather than by copying the example file: a copy would carry
  // the example's "GENERATED — do not edit" header into the one file that is
  // meant to be edited. Like init, an existing file is never touched.
  const env = join(PROJECT_ROOT, ".env");
  let seededEnv = false;
  if (existsSync(env)) {
    checks.push("OK    .env already exists (left untouched)");
  } else {
    await loadRegistry();
    writeFileSync(
      env,
      renderInit("development", new Date().toISOString().slice(0, 10)),
      { flag: "wx" },
    );
    checks.push("OK    created .env (same as `pnpm devtools env init`)");
    seededEnv = true;
  }

  note(checks.join("\n"), "Prerequisites");

  if (seededEnv) {
    log.info(
      ".env starts blank. The local stack fills the connection block for " +
        "you; only a hosted project needs values typed in.",
    );
  }

  note(
    [
      "1. Run `pnpm devtools` again and choose:",
      "     Start my database   — boots the local Docker stack and writes",
      "                           .env.generated (no credentials needed)",
      "",
      "2. pnpm dev --filter platform",
      "",
      "Working against a hosted Supabase project instead? Fill in .env",
      "(dashboard → Project Settings), then:",
      "  pnpm devtools link --remote",
      "  pnpm --filter @devdogsuga/supabase generate-types",
    ].join("\n"),
    "Next steps",
  );
}
