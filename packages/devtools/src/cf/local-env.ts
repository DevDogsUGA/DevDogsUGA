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

/** The app's declared keys, deduped and sorted, from the given entries or the
 * loaded registry.
 *
 * `scope: "default"` + `commented: true` keys are excluded on purpose. That
 * pair is exactly `DEPLOY_ENV` and `NODE_ENV`: their committed source is
 * wrangler.jsonc's per-env `vars` blocks (and the framework), never an env
 * file — see each key's `define()` doc. Materializing them into the temp
 * `.dev.vars` this file feeds to `wrangler dev` lets a stray or empty `.env`
 * value OVERRIDE the tier's wrangler var, which surfaced as a Workflow isolate
 * reading a blank `DEPLOY_ENV` and throwing "has no HYPERDRIVE binding". Every
 * other `default` key (GITHUB_ORG, AIRTABLE_BASE_ID, …) is uncommitted-empty
 * and genuinely sourced from the env file, so only the commented pair is cut. */
async function scopedKeys(
  app: string,
  entries?: readonly EnvEntry[],
): Promise<string[]> {
  if (!entries) {
    await loadRegistry();
    entries = declarations();
  }
  return [
    ...new Set(
      entries
        .filter((entry) => entry.source === app)
        .filter(
          (entry) =>
            !(entry.meta.scope === "default" && entry.meta.commented === true),
        )
        .map((entry) => entry.key),
    ),
  ].sort();
}

/** Writes the mode-0600 `.dev.vars` into a fresh private temp directory. */
function materializeEnvFile(
  keys: readonly string[],
  environment: NodeJS.ProcessEnv,
): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "devtools-wrangler-env-"));
  const path = join(directory, ".dev.vars");
  writeFileSync(path, renderWranglerEnvFile(keys, environment), {
    encoding: "utf8",
    mode: 0o600,
  });
  return { directory, path };
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
  const keys = await scopedKeys(app, options?.entries);
  const { directory, path } = materializeEnvFile(
    keys,
    options?.env ?? process.env,
  );
  try {
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
 * into two for no behavioural gain.
 *
 * `env` mirrors `withWranglerEnv`'s `options.env`: pass a tier's loaded map to
 * materialize a scoped file from THAT tier rather than the inherited process
 * environment; omit it to keep today's behavior.
 */
export async function createTemporaryWranglerEnv(
  app: string,
  env?: NodeJS.ProcessEnv,
): Promise<TemporaryWranglerEnv> {
  const keys = await scopedKeys(app);
  const { directory, path } = materializeEnvFile(keys, env ?? process.env);
  return {
    path,
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}
