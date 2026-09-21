/**
 * BUG 2 fix: keeping this process's environment in sync with the local
 * stack's lifecycle.
 *
 * `launch.ts` enters a deploy tier into `process.env` exactly ONCE, before
 * `cli.ts` ever dispatches a command. `db start` (`startLocalStack`, in
 * `../stack.ts`) then writes a NEW `.env.generated` — the running stack's
 * fresh connection block — and `db stop` (`stopLocalStack`) deletes it. Left
 * alone, `process.env` keeps whatever it held at launch for the rest of a
 * wizard session: `db start` followed by `db introspect` in the SAME
 * session would still hand `drizzle-kit` the stale (or absent)
 * `.env.generated` values `resolveLocalToolingEnv` reads straight off
 * `process.env` (see `local-env.ts`) — the exact staleness BUG 1 fixed
 * `db introspect` from reading off disk, reappearing one layer up.
 *
 * `refreshSessionEnv` closes that gap by re-running the SAME
 * `enterEnvironment("development", …)` `launch.ts` used at startup —
 * overlay-plus-liveness-probe included — after a stack command that could
 * have changed `.env.generated` succeeds.
 *
 * ⚠️ Guarded to development only. `DEPLOY_ENV` naming a deployed tier means
 * this session targets staging or production (see `../db/connection.ts`);
 * blindly re-entering development here would silently overwrite that tier's
 * connection with local values mid-session, for a stack command
 * (`start`/`stop`/`restart`) that only ever touches the LOCAL Docker stack
 * in the first place.
 */
import {
  enterEnvironment as defaultEnterEnvironment,
  type EnteredEnvironment,
} from "@devdogsuga/env/session";
import {
  DEV_DB_ENV,
  GENERATED_FILE,
  LocalStackOfflineError,
} from "@devdogsuga/env/load";

export interface RefreshSessionEnvOptions {
  /** Injectable for tests; defaults to `process.env.DEPLOY_ENV`. */
  deployEnv?: string;
  /** Injectable for tests; defaults to the real `enterEnvironment`. */
  enterEnvironment?: (
    tier: "development",
    opts: { override: boolean },
  ) => Promise<EnteredEnvironment>;
}

/**
 * Re-enters development — refreshing `process.env` from `.env.generated`'s
 * latest state — when (and only when) this process is already running under
 * development. Returns the one-line note callers report on success, or an
 * empty array when the guard held and nothing needed refreshing.
 */
export async function refreshSessionEnv(
  opts: RefreshSessionEnvOptions = {},
): Promise<string[]> {
  const deployEnv = opts.deployEnv ?? process.env.DEPLOY_ENV;
  if (
    deployEnv !== undefined &&
    deployEnv !== "" &&
    deployEnv !== "development"
  ) {
    return [];
  }

  const enter = opts.enterEnvironment ?? defaultEnterEnvironment;
  try {
    await enter("development", { override: true });
  } catch (err) {
    if (!(err instanceof LocalStackOfflineError)) throw err;
    // A `development:local` session whose stack just went down — `db stop`
    // did exactly what it was asked, so this refresh must not turn that into
    // a failure. Re-enter unqualified (probe decides: `.env` alone, with its
    // stale-overlay warning) but LEAVE `DEV_DB` in place: the session still
    // MEANS the local database, and `db/connection.ts`'s guard is what turns
    // a later data command into "start the stack", not `.env`'s own DB_URL.
    const devDb = process.env[DEV_DB_ENV];
    delete process.env[DEV_DB_ENV];
    try {
      await enter("development", { override: true });
    } finally {
      if (devDb !== undefined) process.env[DEV_DB_ENV] = devDb;
    }
  }
  return [`refreshed ${GENERATED_FILE}`];
}
