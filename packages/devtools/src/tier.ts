/**
 * The shared `--tier` resolver for the handful of commands that pick a
 * deploy tier of their OWN, separate from the session-wide tier
 * `src/launch.ts` already resolved and entered before this CLI ever runs
 * (see that file's header, and `@devdogsuga/env/session`, which is where
 * `availableTiers` and the session-wide policy now live — this module used
 * to carry its own copy of both, one of two the wizard's tier question also
 * used to keep before it moved into `launch.ts`).
 *
 * `cf preview`, `cron run` and `workflows run` still need a resolver of their
 * own: each names the tier something it is doing right now — running a
 * workflow, previewing a build — SEPARATELY from the tier the session as a
 * whole is running under (`process.env.DEPLOY_ENV`, honoured here as the
 * fallback below), and a command flag can still name a different one. All
 * three used to ask the same "which tier?" question with a subtly different
 * answer, which is what this module unified. It asks only when the answer is
 * not foregone: when more than one deploy tier's env file is actually
 * present. That is the signature of someone working on the deploy workflow
 * itself, who keeps `.env.staging` or `.env.production` around to test
 * against. Everyone else falls straight through to development, exactly as
 * if `--tier development` had been typed.
 */
import { select } from "@clack/prompts";
import { isDeployEnvironment } from "@devdogsuga/env";
import type { DeployEnvironment } from "@devdogsuga/env";
import { availableTiers } from "@devdogsuga/env/session";
import { DEPLOY_ENVIRONMENTS, fileFor } from "@devdogsuga/env";
import { PROJECT_ROOT } from "./environment.js";
import { unwrap } from "./ui.js";

interface ResolveTierOptions {
  /** Stderr prefix, e.g. "devtools cf preview". */
  label?: string;
  /** Injectable for tests; defaults to `availableTiers(PROJECT_ROOT)`. */
  available?: DeployEnvironment[];
  /**
   * The tier the process has already ENTERED, honoured when no explicit tier
   * was passed. Injectable for tests; defaults to `process.env.DEPLOY_ENV`.
   *
   * The wizard enters a tier once, up front (see `menu.ts`), by loading its
   * env and setting `DEPLOY_ENV`; a `DEPLOY_ENV=staging pnpm devtools …` on
   * the command line does the same. Either way a command that resolves its own
   * tier should use that answer rather than ask a question already settled for
   * the whole session.
   */
  deployEnv?: string;
  /** Injectable for tests; defaults to `process.stdin.isTTY`. */
  isTTY?: boolean;
  /** Injectable for tests; defaults to a clack `select` wrapped in `unwrap`. */
  prompt?: (
    message: string,
    choices: { value: DeployEnvironment; label: string; hint?: string }[],
  ) => Promise<DeployEnvironment>;
}

/**
 * The deploy tier a command runs under when `--tier` was not passed.
 *
 * Prompts ONLY when more than one deploy tier's file is present — the
 * handful of contributors working on the deploy workflow — so that everyone
 * else (just development, possibly with `.env.generated` from a running
 * local stack) falls straight through to development with no prompt at all.
 *
 * Returns `null` after reporting an error on stderr — an invalid `--tier`, or
 * an interactive pick of a tier whose file is missing — so the caller can
 * exit nonzero without printing a second message of its own.
 */
export async function resolveTier(
  given: string | undefined,
  message: string,
  opts: ResolveTierOptions = {},
): Promise<DeployEnvironment | null> {
  const label = opts.label ?? "devtools";

  if (given !== undefined) {
    if (isDeployEnvironment(given)) return given;
    process.stderr.write(
      `${label}: unknown tier "${given}". Expected: ${DEPLOY_ENVIRONMENTS.join(", ")}.\n`,
    );
    return null;
  }

  // Already inside a tier? Honour it instead of prompting. An entered tier is
  // an answer, exactly like an explicit `--tier` above — including one whose
  // file is missing, which `loadEnvironment` then reports — so it is validated
  // for shape only, not existence, and does NOT fall through to the picker.
  const entered = opts.deployEnv ?? process.env.DEPLOY_ENV;
  if (entered !== undefined && entered !== "" && isDeployEnvironment(entered)) {
    return entered;
  }

  const available = opts.available ?? (await availableTiers(PROJECT_ROOT));

  // Zero or one tier file present: there is nothing to choose between, so
  // asking would be a question with one possible answer. Fall through to
  // whichever tier is present, or development when nothing is (a machine
  // that has never run `env pull` at all).
  if (available.length <= 1) return available[0] ?? "development";

  const isTTY = opts.isTTY ?? process.stdin.isTTY;
  if (!isTTY) return "development";

  const prompt =
    opts.prompt ??
    (async (msg, choices) =>
      unwrap(
        await select<DeployEnvironment>({
          message: msg,
          options: choices,
        }),
      ));

  // Show every deploy tier, not just the present ones: clack's `select` has
  // no true "disabled" state, so a tier whose file is missing is shown with
  // a hint that says so and how to fix it, rather than removed from the list
  // where a contributor who expected to see "production" would wonder if
  // they misconfigured something.
  const choices = DEPLOY_ENVIRONMENTS.map((tier) => ({
    value: tier,
    label: tier,
    hint: !available.includes(tier)
      ? `needs env pull --target ${tier}`
      : tier === "development"
        ? "the default"
        : tier === "production"
          ? "⚠️  live data"
          : undefined,
  }));

  const choice = await prompt(message, choices);
  if (!available.includes(choice)) {
    process.stderr.write(
      `${label}: ${fileFor(choice)} is not present — run \`pnpm devtools env pull --target ${choice}\` first.\n`,
    );
    return null;
  }
  return choice;
}
