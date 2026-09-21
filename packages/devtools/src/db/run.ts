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

/** Spawn a pnpm command with inherited stdio; resolves to the exit code. Pass
 * `env` to run the child against a loaded tier rather than process.env. */
export function run(args: string[], env?: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = nodeSpawn("pnpm", args, {
      stdio: "inherit",
      cwd: PROJECT_ROOT,
      ...(env ? { env } : {}),
    });
    child.on("error", (error) => {
      process.stderr.write(`${error.message}\n`);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export interface RunWithStderrResult {
  code: number;
  stderr: string;
}

/** Spawn a pnpm command while echoing and retaining stderr for diagnostics.
 * Pass `env` to run the child against a loaded tier rather than process.env. */
export function runWithStderr(
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<RunWithStderrResult> {
  return new Promise((resolve) => {
    const child = nodeSpawn("pnpm", args, {
      stdio: ["inherit", "inherit", "pipe"],
      cwd: PROJECT_ROOT,
      ...(env ? { env } : {}),
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      const message = `${error.message}\n`;
      stderr += message;
      process.stderr.write(message);
      resolve({ code: 1, stderr });
    });
    child.on("exit", (code) => resolve({ code: code ?? 1, stderr }));
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

/**
 * Generate and write Database types from the session's database.
 *
 * Always `--db-url` — the session's own connection string, never the
 * supabase CLI's `--local`/`--linked` modes, whose defaults can disagree
 * with what this process entered. See `db/connection.ts`'s header.
 */
export async function generateTypes(dbUrl: string): Promise<number> {
  let out: string;
  try {
    out = await supabaseCapture("gen", "types", "--db-url", dbUrl);
  } catch {
    return 1;
  }
  await writeFile(TYPES_FILE, out);
  const relPath = join("packages", "supabase", "src", "database.types.ts");
  const fmt = await prettierWrite(relPath);
  if (fmt !== 0) return fmt;
  return buildSupabase();
}

/**
 * `seed buckets` takes no `--db-url` (verified against the supabase 2.115.0
 * CLI) — it drives the Storage API, not Postgres — so it is the one data
 * command still keyed on local-vs-hosted rather than on the session's URL.
 */
export type BucketsConnection =
  { kind: "local" } | { kind: "remote"; projectRef: string | undefined };

/** Seed storage buckets on the local stack or a resolved tier's project. */
export async function seedBuckets(conn: BucketsConnection): Promise<number> {
  if (conn.kind === "local") {
    return supabase("seed", "buckets", "--local", "--yes");
  }
  // Surfaced here, before the supabase CLI ever runs, rather than left for it
  // to reject: an empty `--project-ref ""` is exactly the kind of ambiguous
  // failure this whole module exists to avoid.
  if (!conn.projectRef) {
    process.stderr.write(
      "devtools db: seed buckets against a hosted project needs PROJECT_REF in the session's env file.\n",
    );
    return 1;
  }
  // `seed buckets` (unlike `config push`) rejects a bare `--project-ref` as
  // ambiguous with `--local` and demands `--linked` alongside it. That does
  // NOT mean it needs an ambient `supabase link` state on disk — verified
  // empirically in an unlinked checkout, `--project-ref` names the target
  // directly and `--linked` is just the mode selector for "use that ref",
  // not "use whatever `supabase link` last remembered". So this stays
  // consistent with `db/connection.ts`'s rule of never depending on
  // `--linked`'s persisted state.
  return supabase(
    "seed",
    "buckets",
    "--project-ref",
    conn.projectRef,
    "--linked",
  );
}
