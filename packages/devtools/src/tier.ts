/**
 * The shared `--tier` resolver.
 *
 * Several commands run under a deploy tier (`cf preview`, `cron run`,
 * `workflows run`) and all three used to ask the same "which tier?" question
 * with a subtly different answer: `cron run` prompted unconditionally the
 * moment `--tier` was absent, `workflows run` did the same behind its own
 * copy of the same picker, and `cf preview` prompted through the command
 * tree's own `select` regardless of whether there was anything to choose
 * between. For the overwhelming majority of contributors — one `.env`, no
 * `.env.staging` or `.env.production` on their machine — that is a question
 * with one possible answer, asked anyway.
 *
 * This module asks it only when the answer is not foregone: when more than
 * one deploy tier's env file is actually present. That is the signature of
 * someone working on the deploy workflow itself, who keeps `.env.staging` or
 * `.env.production` around to test against. Everyone else falls straight
 * through to development, exactly as if `--tier development` had been typed.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { select } from "@clack/prompts";
import {
  DEPLOY_ENVIRONMENTS,
  fileFor,
  isDeployEnvironment,
} from "@devdogsuga/env";
import type { DeployEnvironment } from "@devdogsuga/env";
import { PROJECT_ROOT } from "./environment.js";
import { unwrap } from "./ui.js";

/**
 * Deploy tiers whose canonical `.env.<tier>` file exists, in danger order.
 *
 * `.env.generated` is development's local-stack overlay — written whenever
 * `devtools db start` brings the local Supabase stack up — not a second
 * tier's credentials. Consulting `fileFor(tier)` over `DEPLOY_ENVIRONMENTS`
 * rather than globbing `.env*` is what keeps a running local stack from
 * making development count twice and tripping the prompt for everyone who
 * has ever started it.
 */
export function availableTiers(
  exists: (relPath: string) => boolean = (f) =>
    existsSync(join(PROJECT_ROOT, f)),
): DeployEnvironment[] {
  return DEPLOY_ENVIRONMENTS.filter((tier) => exists(fileFor(tier)));
}

interface ResolveTierOptions {
  /** Stderr prefix, e.g. "devtools cf preview". */
  label?: string;
  /** Injectable for tests; defaults to `availableTiers()`. */
  available?: DeployEnvironment[];
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

  const available = opts.available ?? availableTiers();

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
