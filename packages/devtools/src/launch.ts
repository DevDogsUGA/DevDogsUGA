#!/usr/bin/env tsx
/**
 * `pnpm devtools`'s actual entry point, run by the `bin/devtools.mjs`
 * bootstrap BEFORE `cli.ts` — and therefore every command it dispatches — is
 * even imported.
 *
 * ## Why this has to run first
 *
 * A deploy tier used to be resolved deep inside `menu.ts`, after the wizard
 * had already opened, and a typed command's tier lived wherever that command
 * happened to resolve one — `cf preview`, `cron run` and `db --target remote`
 * each asking their own question. That meant `--tier` only worked for the
 * commands that had been taught to parse it, and a contributor who wanted
 * `pnpm devtools db status --target remote --tier staging` piped through a
 * wizard question first anyway.
 *
 * This module settles the tier ONCE, before any command's imports — let alone
 * its code — run, using the shared policy in `@devdogsuga/env/session`. By
 * the time `cli.ts` is imported, `process.env.DEPLOY_ENV` already names the
 * tier and its env files are already loaded, so `cli.ts`, `menu.ts` and every
 * runner underneath them just read `process.env` like any other command would
 * under `with-env` — this module IS the replacement for `with-env`'s job.
 *
 * ## `--tier`, a global flag
 *
 * `--tier <t>` is accepted at ANY position in argv and stripped here before
 * `cli.ts` ever sees the rest, precisely so it cannot collide with a
 * command's own flag of the same name (`db --target remote --tier staging`,
 * `cron run --tier production`) — those still parse their OWN `--tier` out of
 * the argv `cli.ts` receives, but by then the session's tier decision has
 * already been made, and `resolveTier` (see `tier.ts`) falls back to reading
 * it off `process.env.DEPLOY_ENV` rather than asking again.
 */
import { select } from "@clack/prompts";
import type { DeployEnvironment } from "@devdogsuga/env";
import { MissingEnvFileError } from "@devdogsuga/env/load";
import {
  availableTiers,
  enterEnvironment,
  resolveSessionTier,
  type TierChoice,
} from "@devdogsuga/env/session";
import { PROJECT_ROOT } from "./environment.js";
import { errorMessage, unwrap } from "./ui.js";

/**
 * Pulls a global `--tier <t>` out of `argv`, wherever it sits, leaving every
 * other argument untouched and in its original order. Exported for its own
 * unit tests; `launch()` below is the only real caller.
 */
export function stripTierFlag(argv: readonly string[]): {
  explicit: string | undefined;
  rest: string[];
} {
  const rest = [...argv];
  const index = rest.indexOf("--tier");
  if (index === -1) return { explicit: undefined, rest };
  const value = rest[index + 1];
  // A trailing `--tier` with nothing after it removes just the flag; the
  // missing value then reaches `resolveSessionTier` as `explicit: undefined`,
  // which falls through to `DEPLOY_ENV`/the sole tier/the prompt exactly as
  // if `--tier` had never been typed, rather than this function guessing.
  //
  // A following token that is itself a flag is treated the same way, NOT
  // consumed as the value — the guard every other flag-value reader in this
  // CLI keeps (`cli.ts`'s `flagValue`, `db/remote.ts`'s). Without it,
  // `--tier --help` or `--tier -h` would swallow the flag as a bogus tier and
  // refuse with "unknown tier" instead of reaching the help bypass below.
  const missing = value === undefined || value.startsWith("-");
  rest.splice(index, missing ? 1 : 2);
  return { explicit: missing ? undefined : value, rest };
}

/** The real interactive picker: a clack `select`, unwrapped so Ctrl-C exits
 * cleanly instead of leaking a cancel symbol into `resolveSessionTier`. */
async function promptTier(
  message: string,
  choices: TierChoice[],
): Promise<DeployEnvironment> {
  return unwrap(await select<DeployEnvironment>({ message, options: choices }));
}

/**
 * Imports `cli.ts` and runs it, reporting a thrown rejection the same way
 * `cli.ts`'s own top level used to before `main` became an export instead of
 * an auto-running IIFE (see `main`'s own header). Shared by both places
 * `launch()` hands off to it: the `--help`/`-h` bypass below, and the normal
 * post-tier-resolution path.
 */
async function dispatch(argv: string[]): Promise<void> {
  const { main } = await import("./cli.js");
  try {
    await main(argv);
  } catch (err) {
    process.stderr.write(`devtools: ${errorMessage(err)}\n`);
    process.exit(1);
  }
}

/**
 * Resolves the session's deploy tier, enters it, and hands off to `cli.ts`.
 *
 * Exits the process directly on a refusal from `resolveSessionTier` — there
 * is no command dispatched yet for a caller to fall back to, so there is
 * nothing this function could return that would mean anything.
 */
export async function launch(argv: readonly string[]): Promise<void> {
  const { explicit, rest } = stripTierFlag(argv);

  // `--help`/`-h` bypasses tier resolution entirely, BEFORE it can refuse.
  // `cli.ts`'s own `main()` already answers these with no env in play (see
  // its header comment); resolving a tier first anyway meant `pnpm devtools
  // --help` refused outright on a machine with two-or-more tier files
  // present — the ordinary state for anyone who has ever run `env pull` for
  // staging or production — even though the command that would have run
  // needs no database, credential, or `DEPLOY_ENV` at all. `bw --help` is
  // NOT special-cased here the way `cli.ts` special-cases it ahead of its own
  // `--help` check: `main()` still sees `bw` first and hands off to Bitwarden
  // before ever reaching its `--help` branch, so routing straight to `main()`
  // below reproduces that passthrough correctly either way.
  if (rest.includes("--help") || rest.includes("-h")) {
    await dispatch(rest);
    return;
  }

  let tier: DeployEnvironment;
  if (rest[0] === "setup" || rest[0] === "completions") {
    // Two commands run BEFORE there is a tier to resolve, and forcing the
    // mandate on them breaks each in its own way:
    //
    //   * `setup` exists to CREATE a missing env file. A stale
    //     `DEPLOY_ENV=staging` in the shell with no `.env.staging` on disk
    //     would resolve that tier, fail `enterEnvironment` fatally below, and
    //     lock a new contributor out of the one command that fixes their
    //     state — a bootstrap deadlock. It is development-only by nature
    //     (it writes `.env`), so the session tier question has one answer.
    //   * `completions` runs from shell rc files (`eval "$(pnpm devtools
    //     completions bash)"`), always non-TTY, and reads no env at all; the
    //     multi-tier refusal would exit 1 in every new shell on exactly the
    //     machines of the people working on the deploy workflow.
    //
    // Development is still ENTERED below (missing-file tolerated), not
    // skipped: `setup` under the old `with-env` wrapper saw whatever `.env`
    // already existed, and keeping that means it can read current values
    // when offering to rewrite them.
    tier = "development";
  } else {
    const resolution = await resolveSessionTier({
      explicit,
      deployEnv: process.env.DEPLOY_ENV,
      available: await availableTiers(PROJECT_ROOT),
      isTTY: process.stdin.isTTY === true,
      prompt: promptTier,
      promptMessage: "Which deploy tier should these commands use?",
    });

    if (!resolution.ok) {
      process.stderr.write(`devtools: ${resolution.reason}\n`);
      process.exit(1);
    }

    tier = resolution.tier;
  }

  try {
    // `override: false` — a fresh process, so an already-exported shell
    // variable beats the file the same way `with-env` always let it, rather
    // than a stale `.env.<tier>` value silently winning over what the caller
    // just set for this one invocation.
    const entered = await enterEnvironment(tier, { override: false });
    for (const warning of entered.warnings) {
      process.stderr.write(`devtools: ${warning}\n`);
    }
    // Mandatory, not chattiness: which database a command is about to touch
    // must never be a guess. See `session.ts`'s and `load.ts`'s own headers.
    process.stderr.write(
      `devtools: loaded ${entered.files.length > 0 ? entered.files.join(", ") : "no env files"} (${tier})\n`,
    );
  } catch (err) {
    if (!(err instanceof MissingEnvFileError)) throw err;

    if (tier === "development") {
      // The clean-clone path: a fresh checkout has no `.env` at all, and
      // `pnpm devtools setup` is how one gets created — `MissingEnvFileError`
      // names it. Reporting and continuing here, rather than refusing, is
      // what lets `setup` itself run through this same entry point. See
      // `load.ts`'s `MissingEnvFileError` for the message this prints.
      process.stderr.write(`devtools: ${err.message}\n`);
    } else {
      // An EXPLICITLY selected staging/production tier with no env file is
      // not a first run — it is a real problem, and `env pull` is the fix
      // `MissingEnvFileError`'s own message already names. Fatal.
      process.stderr.write(`devtools: ${err.message}\n`);
      process.exit(1);
    }
  }

  // Caught here rather than left to `bin/devtools.mjs`'s `child.on("error",
  // …)`, which only ever sees a spawn failure, never a rejection thrown
  // inside this process.
  await dispatch(rest);
}

// `bin/devtools.mjs` runs this file directly through tsx — `tsx
// --conditions=devdogs-source src/launch.ts <argv…>` — so `process.argv`
// carries this file's own path where a bare `node` invocation would, and the
// real argv starts one slot later.
if (import.meta.url === `file://${process.argv[1]}`) {
  await launch(process.argv.slice(2));
}
