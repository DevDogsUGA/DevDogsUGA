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
 * `--local` for the Docker stack; for a hosted project, the resolved tier's
 * OWN `--db-url` rather than the CLI's ambient `--linked` project, which the
 * caller may not be pointed at. See `db/remote.ts`'s header for why that
 * distinction is safety-critical for `db reset --target remote`.
 */
export type TypesConnection =
  { kind: "local" } | { kind: "remote"; dbUrl: string };

/** Generate and write Database types from a local or resolved-tier project. */
export async function generateTypes(conn: TypesConnection): Promise<number> {
  let out: string;
  try {
    out = await supabaseCapture(
      "gen",
      "types",
      ...(conn.kind === "remote" ? ["--db-url", conn.dbUrl] : ["--local"]),
    );
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
 * CLI) — only `--project-ref` — so the remote shape here differs from
 * `TypesConnection`'s.
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
      "devtools db: seed buckets --target remote needs PROJECT_REF in the resolved tier's env file.\n",
    );
    return 1;
  }
  return supabase("seed", "buckets", "--project-ref", conn.projectRef);
}
