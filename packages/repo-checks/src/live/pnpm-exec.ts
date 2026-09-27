/**
 * Spawns `pnpm exec <bin> …` from the repo root and captures its result —
 * the shared helper behind every black-box devtools/devtools-ci test in this
 * package. `pnpm exec` (rather than a hand-resolved path into
 * node_modules/.bin) is what production CI and every contributor actually
 * run, so this is the same resolution path as the real thing, not a stand-in
 * for it.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PROJECT_ROOT } from "../project-root.js";

const run = promisify(execFile);

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * The child never inherits the FULL parent environment by default — a
 * developer's shell may hold DEPLOY_ENV, a Bitwarden token, or a leftover
 * .env value, and each of those can change which branch a devtools command
 * takes. Callers pass exactly the env they mean to test with; PATH and HOME
 * are always included since pnpm/node need them to run at all.
 */
export async function pnpmExec(
  bin: string,
  args: readonly string[],
  env: Record<string, string> = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await run("pnpm", ["exec", bin, ...args], {
      cwd: PROJECT_ROOT,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        // pnpm records its settings at install time, and `CI` changes them.
        // Drop it and pnpm sees a mismatch, reinstalls before running the
        // bin, and prints the install to stdout (racing any parallel test).
        ...(process.env.CI ? { CI: process.env.CI } : {}),
        ...env,
      },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: e.code ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}
