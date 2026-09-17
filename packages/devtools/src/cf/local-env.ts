import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { declarations, type EnvEntry } from "@devdogsuga/env";
import { loadRegistry } from "../env/discovery.js";

export function renderWranglerEnvFile(
  keys: readonly string[],
  environment: NodeJS.ProcessEnv,
): string {
  return (
    keys
      .flatMap((key) => {
        const value = environment[key];
        // dotenv preserves single-quoted values byte-for-byte, including
        // multiline private keys and literal backslash sequences.
        return value === undefined ? [] : [`${key}='${value}'`];
      })
      .join("\n") + "\n"
  );
}

/**
 * Runs `fn` with the path to an app-scoped, mode-0600 `.dev.vars` file, and
 * guarantees the file (and its containing directory) is gone before this
 * resolves or rejects — including when `fn` throws. Prefer this over
 * `createTemporaryWranglerEnv` below for anything whose credential-bearing
 * file's lifetime matches a single call's lifetime: a credential-bearing temp
 * file can never outlive the call that needed it.
 */
export async function withWranglerEnv<T>(
  app: string,
  fn: (envFilePath: string) => Promise<T>,
  options?: { env?: NodeJS.ProcessEnv; entries?: readonly EnvEntry[] },
): Promise<T> {
  const environment = options?.env ?? process.env;
  let entries = options?.entries;
  if (!entries) {
    await loadRegistry();
    entries = declarations();
  }
  const keys = [
    ...new Set(
      entries.filter((entry) => entry.source === app).map((entry) => entry.key),
    ),
  ].sort();
  const directory = mkdtempSync(join(tmpdir(), "devtools-wrangler-env-"));
  try {
    const path = join(directory, ".dev.vars");
    writeFileSync(path, renderWranglerEnvFile(keys, environment), {
      encoding: "utf8",
      mode: 0o600,
    });
    return await fn(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export interface TemporaryWranglerEnv {
  path: string;
  remove: () => void;
}

/**
 * Create an app-scoped, mode-0600 env file for a local Worker runtime whose
 * lifetime a single bracket callback cannot express.
 *
 * ⚠️ KEPT DELIBERATELY, not an oversight: `workflows/commands.ts` holds this
 * file open across a long-lived `wrangler dev` child process, and in the
 * `workflows run` temporary-session path that span crosses a `finally` that
 * is unrelated to starting Wrangler at all — it also triggers a Workflow and
 * polls for its completion before the session stops. Squeezing that into a
 * single `withWranglerEnv` callback would mean merging two previously
 * independent concerns (spinning up a dev session; triggering-and-waiting)
 * into one control path, which is a real redesign of a 700-line orchestrator,
 * not a mechanical bracket swap — and duplicating this function's
 * retry/readiness loop across a bracket-shaped variant just to convert the
 * `workflows serve` half would fragment one shared, tested implementation
 * into two for no behavioural gain. See the architecture review this module
 * came from for the full call.
 */
export async function createTemporaryWranglerEnv(
  app: string,
): Promise<TemporaryWranglerEnv> {
  await loadRegistry();
  const keys = [
    ...new Set(
      declarations()
        .filter((entry) => entry.source === app)
        .map((entry) => entry.key),
    ),
  ].sort();
  const directory = mkdtempSync(join(tmpdir(), "devtools-wrangler-env-"));
  const path = join(directory, ".dev.vars");
  writeFileSync(path, renderWranglerEnvFile(keys, process.env), {
    encoding: "utf8",
    mode: 0o600,
  });
  return {
    path,
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}
