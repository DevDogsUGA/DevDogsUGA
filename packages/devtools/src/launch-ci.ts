#!/usr/bin/env tsx
/**
 * `devtools-ci`'s entry point, in the same shape as `src/launch.ts` (read
 * that file's header first) — resolve the session's deploy tier and enter its
 * environment BEFORE `ci.ts` is imported — but with one deliberate
 * difference: this NEVER prompts.
 *
 * CI is never interactive — `process.stdin.isTTY` is `undefined` in every job
 * this runs in — so `resolveSessionTier` would already refuse to prompt on
 * its own `isTTY` check. No `prompt` function is injected anyway, making that
 * doubly true rather than relying on the ambient TTY guess: a CI job that
 * somehow got attached to a terminal must still refuse ambiguity outright
 * instead of hanging on a question nobody in a workflow can answer.
 *
 * ## Which `devtools-ci` invocations reach this file at all
 *
 * Only `run ci:env` does. The bare `run ci` package script — used for
 * `deploy write-env`, which CREATES the env file this module would otherwise
 * insist on reading, and for the handful of steps that hold one narrow
 * credential and compose no env file at all — still runs `ci.ts` directly
 * through `tsx`, deliberately bypassing tier resolution entirely. See
 * `.github/workflows/deploy.yaml`'s own header for the two entry points and
 * why each step picked the one it did.
 *
 * A `deploy <app> --tier <t>` invocation's `--tier` is a command flag `ci.ts`
 * parses for itself (see its `runDeployCommand`), not this module's global
 * `--tier` — but they resolve to the same tier here: `stripTierFlag` pulls it
 * off before `ci.ts` sees argv, `resolveSessionTier` resolves the identical
 * value as `explicit`, and `ci.ts`'s own parse then falls back to
 * `process.env.DEPLOY_ENV`, which `enterEnvironment` just set to it.
 */
import { MissingEnvFileError } from "@devdogsuga/env/load";
import {
  availableTiers,
  enterEnvironment,
  resolveSessionTier,
} from "@devdogsuga/env/session";
import { PROJECT_ROOT } from "./environment.js";
import { stripTierFlag } from "./launch.js";

export async function launchCi(argv: readonly string[]): Promise<void> {
  const { explicit, rest } = stripTierFlag(argv);

  const resolution = await resolveSessionTier({
    explicit,
    deployEnv: process.env.DEPLOY_ENV,
    available: await availableTiers(PROJECT_ROOT),
    isTTY: false,
    // No `prompt` — see this file's header. Ambiguity is always a refusal.
  });

  if (!resolution.ok) {
    process.stderr.write(`devtools-ci: ${resolution.reason}\n`);
    process.exit(1);
  }

  const tier = resolution.tier;

  try {
    const entered = await enterEnvironment(tier, { override: false });
    for (const warning of entered.warnings) {
      process.stderr.write(`devtools-ci: ${warning}\n`);
    }
    process.stderr.write(
      `devtools-ci: loaded ${entered.files.length > 0 ? entered.files.join(", ") : "no env files"} (${tier})\n`,
    );
  } catch (err) {
    if (!(err instanceof MissingEnvFileError)) throw err;
    // A CI job that reaches `run ci:env` at all has already run `deploy
    // write-env` (see this file's header), so a missing file here — for
    // ANY tier, `development` included — is never a first-run story the way
    // it is for a contributor's own machine. Always fatal.
    process.stderr.write(`devtools-ci: ${err.message}\n`);
    process.exit(1);
  }

  const { main } = await import("./ci.js");
  try {
    await main(rest);
  } catch (err) {
    process.stderr.write(
      `devtools-ci: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}

// See `launch.ts`'s matching guard for why this checks `process.argv[1]`
// rather than self-invoking unconditionally.
if (import.meta.url === `file://${process.argv[1]}`) {
  await launchCi(process.argv.slice(2));
}
