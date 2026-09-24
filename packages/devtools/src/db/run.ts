/**
 * Shared helpers for running supabase CLI and pnpm commands from the repo root.
 *
 * The supabase CLI is a workspace devDependency (not a global install), so
 * every invocation goes through `pnpm exec supabase`. The cwd is always
 * PROJECT_ROOT, where `supabase/config.toml` lives.
 */
import { generateDatabaseTypes } from "@devdogsuga/db/typegen";
import { execFile, spawn as nodeSpawn } from "node:child_process";
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

/** Build the supabase package (compiles database.types.ts into dist/). */
export const buildSupabase = () =>
  run(["--filter", "@devdogsuga/supabase", "build"]);

/**
 * Generate and write Database types from the session's database.
 *
 * Delegates to `@devdogsuga/db/typegen`'s `generateDatabaseTypes`, which runs
 * `pnpm exec supabase gen types --db-url <dbUrl>` (always `--db-url` — the
 * session's own connection string, never the supabase CLI's
 * `--local`/`--linked` modes, whose defaults can disagree with what this
 * process entered; see `db/connection.ts`'s header) and formats the result
 * with `pnpm exec prettier --write`, both run against `PROJECT_ROOT` so the
 * workspace-pinned CLI versions are what actually run.
 */
export async function generateTypes(dbUrl: string): Promise<number> {
  try {
    await generateDatabaseTypes({
      dbUrl,
      outFile: TYPES_FILE,
      cwd: PROJECT_ROOT,
    });
  } catch {
    return 1;
  }
  return buildSupabase();
}

/**
 * `supabase db push` over `dbUrl`, inherited stdio, resolving to the exit code.
 *
 * The one spelling of the migration push, shared by the contributor `db
 * migrate` path (`stack.ts`'s `pushMigrations`) and CI's `deploy migrate`.
 * `--yes` is the unattended apply CI wants; the contributor path omits it so a
 * human still confirms. Neither variant regenerates types — that is
 * `pushMigrations`' own second step, layered on top only where a checkout is
 * meant to be rewritten. A CI apply must NOT write back into the repo, which is
 * exactly why the bare push is factored out here rather than reused whole.
 */
export function dbPush(
  dbUrl: string,
  opts: { yes?: boolean } = {},
): Promise<number> {
  const args = ["db", "push", "--db-url", dbUrl];
  if (opts.yes) args.push("--yes");
  return supabase(...args);
}

/**
 * `supabase db push --dry-run` over `dbUrl`, returning the plan text (stdout
 * and stderr combined, as the workflow's old `2>&1` did).
 *
 * Throws on a non-zero exit — which for a dry run means the CONNECTION failed,
 * not that the plan came back empty. That throw is the invariant `deploy plan`
 * leans on, and the thing the old shell needed `set -o pipefail` to preserve: a
 * dead connection must fail the step rather than read as "no migrations to
 * apply". The child's own output is surfaced in the thrown message, because for
 * a dry run that output is precisely the reason the operator needs.
 */
export async function dbPushDryRun(dbUrl: string): Promise<string> {
  try {
    const { stdout, stderr } = await runFile(
      "pnpm",
      ["exec", "supabase", "db", "push", "--db-url", dbUrl, "--dry-run"],
      { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return `${stdout}${stderr}`;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    throw new Error(
      detail
        ? `supabase db push --dry-run failed:\n${detail}`
        : (e.message ?? "supabase db push --dry-run failed"),
    );
  }
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
