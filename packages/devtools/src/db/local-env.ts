/**
 * The environment `db introspect` and `db migration generate` hand to the
 * `drizzle-kit` child process they spawn.
 *
 * ## Which of the two connection mechanisms this is
 *
 * `db/remote.ts`'s header inventories the other one — `resolveRemoteConnection`,
 * a deploy TIER read straight from `.env.<tier>`, for `--target remote` work.
 * This is the local-tooling half: these two commands have no `--target` flag
 * at all, so there is no tier to resolve. What they need is whatever
 * environment THIS PROCESS already entered — `launch.ts` runs before
 * `cli.ts`'s command dispatch even imports, and enters a tier (development,
 * by default) into `process.env` via `@devdogsuga/env/session`'s
 * `enterEnvironment`, applying `selectEnvFiles`'s overlay-plus-liveness-probe
 * logic (`.env.generated`, the running local stack's connection block,
 * ahead of `.env` — see `load.ts`'s probe table) along the way.
 *
 * These two commands used to bypass all of that: each parsed `.env` directly
 * with raw `dotenv`, and merged it OVER `process.env`
 * (`{...process.env, ...tierEnv}`). Two bugs followed from that shortcut:
 *
 *   a. `.env.generated` — where the running local stack's `DB_URL` actually
 *      lives — was never read, so with the stack up these commands reported
 *      "DB_URL is not set in .env. Run `supabase start` first" (wrong
 *      command AND wrong file) or silently connected to a stale/hosted URL,
 *      while every other command in this CLI, going through `selectEnvFiles`,
 *      worked fine.
 *   b. The precedence was inverted: a raw `.env` parse merged OVER
 *      `process.env` clobbers whatever tier this process actually entered —
 *      backwards from `db/remote.ts`'s own documented expectation (see its
 *      header) that a command reads the tier the process is already running
 *      under rather than reimposing development on top of it.
 *
 * `resolveLocalToolingEnv` fixes both by returning `process.env` itself
 * (fresh values, `.env.generated` included, whatever tier was entered)
 * instead of re-deriving anything. The only case it still loads a tier
 * itself is a caller that reaches these commands WITHOUT going through
 * `launch.ts` first — `process.env.DEPLOY_ENV` unset is the tell, since
 * `enterEnvironment` always sets it, even for `development` — and even then
 * it falls back to `loadEnvironment("development")`, never a raw dotenv
 * parse, so the overlay-plus-probe logic still applies.
 */
import {
  loadEnvironment as defaultLoadEnvironment,
  type LoadedEnvironment,
} from "@devdogsuga/env/load";

export interface ResolveLocalToolingEnvOptions {
  /** Injectable for tests; defaults to `process.env`. */
  processEnv?: NodeJS.ProcessEnv;
  /** Injectable for tests; defaults to the real `loadEnvironment`. */
  loadEnvironment?: (
    deployEnv?: string,
    options?: { override?: boolean },
  ) => Promise<LoadedEnvironment>;
}

/**
 * Returns the environment a local-tooling child process (`drizzle-kit`,
 * spawned by `db introspect` / `db migration generate`) should inherit.
 *
 * Normal path (the process went through `launch.ts`, as `pnpm devtools`
 * always does): returns `process.env` unchanged — it already carries
 * whatever tier was entered, `.env.generated` overlay included.
 *
 * Fallback path (no tier was ever entered — a direct import, e.g. from a
 * test, or a future caller that skips `launch.ts`): loads development
 * through the shared `loadEnvironment`, which applies the same overlay and
 * liveness probe `selectEnvFiles` always has, then returns that snapshot.
 */
export async function resolveLocalToolingEnv(
  opts: ResolveLocalToolingEnvOptions = {},
): Promise<NodeJS.ProcessEnv> {
  const processEnv = opts.processEnv ?? process.env;
  if (processEnv.DEPLOY_ENV !== undefined && processEnv.DEPLOY_ENV !== "") {
    return processEnv;
  }

  const load = opts.loadEnvironment ?? defaultLoadEnvironment;
  const loaded = await load("development");
  return loaded.env;
}
