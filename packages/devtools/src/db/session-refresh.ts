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
 * this process is doing `--target remote` work against staging or
 * production (see `../db/remote.ts`); blindly re-entering development here
 * would silently overwrite that tier's connection with local values
 * mid-session, for a stack command (`start`/`stop`/`restart`) that only
 * ever touches the LOCAL Docker stack in the first place.
 */
import {
  enterEnvironment as defaultEnterEnvironment,
  type EnteredEnvironment,
} from "@devdogsuga/env/session";
import { GENERATED_FILE } from "@devdogsuga/env/load";

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
  await enter("development", { override: true });
  return [`refreshed ${GENERATED_FILE}`];
}
