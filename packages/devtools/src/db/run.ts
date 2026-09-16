/**
 * Shared helpers for running supabase CLI and pnpm commands from the repo root.
 *
 * The supabase CLI is a workspace devDependency (not a global install), so
 * every invocation goes through `pnpm exec supabase`. The cwd is always
 * PROJECT_ROOT, where `supabase/config.toml` lives.
 */
import { execFile, spawn as nodeSpawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PROJECT_ROOT } from "../environment.js";

const runFile = promisify(execFile);

export const TYPES_FILE = join(
  PROJECT_ROOT,
  "packages",
  "supabase",
  "src",
  "database.types.ts",
);

/** Spawn a pnpm command with inherited stdio; resolves to the exit code. */
export function run(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = nodeSpawn("pnpm", args, { stdio: "inherit", cwd: PROJECT_ROOT });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** Spawn a pnpm command, capture stdout, throw on non-zero exit. */
export async function capture(args: string[]): Promise<string> {
  const { stdout } = await runFile("pnpm", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  return stdout;
}

/** `pnpm exec supabase …` with inherited stdio. */
export const supabase = (...args: string[]) =>
  run(["exec", "supabase", ...args]);

/** `pnpm exec supabase …` with captured stdout. */
export const supabaseCapture = (...args: string[]) =>
  capture(["exec", "supabase", ...args]);

/** `pnpm exec prettier --write <repo-relative path>`. */
export const prettierWrite = (path: string) =>
  run(["exec", "prettier", "--write", path]);

/** Build the supabase package (compiles database.types.ts into dist/). */
export const buildSupabase = () =>
  run(["--filter", "@devdogsuga/supabase", "build"]);

/** Generate and write Database types from a linked or local project. */
export async function generateTypes(linked: boolean): Promise<number> {
  let out: string;
  try {
    out = await supabaseCapture("gen", "types", linked ? "--linked" : "--local");
  } catch {
    return 1;
  }
  await writeFile(TYPES_FILE, out);
  const relPath = join("packages", "supabase", "src", "database.types.ts");
  const fmt = await prettierWrite(relPath);
  if (fmt !== 0) return fmt;
  return buildSupabase();
}

/** Seed storage buckets (linked = remote, !linked = local). */
export const seedBuckets = (linked: boolean) =>
  linked
    ? supabase("seed", "buckets", "--linked")
    : supabase("seed", "buckets", "--local", "--yes");
