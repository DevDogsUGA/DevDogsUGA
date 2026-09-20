/**
 * The shared tier-SESSION core: which deploy tier a process runs under, and
 * entering it.
 *
 * `with-env` and the devtools launcher both used to ask "which tier?" with
 * their own copy of the answer (see `packages/devtools/src/tier.ts`, whose
 * `availableTiers`/`resolveTier` this module supersedes as the one place the
 * policy lives). Two copies drift: a typo in `DEPLOY_ENV` fell through to the
 * picker in one implementation and would have run as development in a
 * hand-rolled second one, and neither mistake shows up until someone actually
 * has the typo. `resolveSessionTier` below is the ONE policy; every caller
 * gets a discriminated result it can print and act on identically.
 *
 * `availableTiers`/`resolveSessionTier` are pure: file existence, the
 * ambient `DEPLOY_ENV`, TTY-ness and the prompt function are all injected, so
 * the policy table is exercised in `session.test.ts` without touching a real
 * filesystem or terminal. `enterEnvironment` is deliberately NOT pure — its
 * entire job is mutating `process.env` for the CURRENT process, which is
 * what "entering" a tier means — and is left untested here for that reason;
 * it is a thin, one-branch-free wrapper around `loadEnvironment`, which
 * already carries the coverage for selection and loading.
 *
 * ⚠️ This module is exported as the `@devdogsuga/env/session` subpath ON
 * PURPOSE, mirroring `load.ts`'s own subpath split, and MUST stay out of
 * `index.ts`. The root `"."` export is imported by `apps/platform`, which
 * deploys to Cloudflare Workers; `enterEnvironment` calls `loadEnvironment`,
 * which dynamically imports `node:fs`/`node:path`/`node:url` and
 * `@dotenvx/dotenvx`, none of which exist at the edge. Re-exporting any of
 * this from `index.ts` would make an edge import fail at runtime instead of
 * at build.
 */
import { fileFor, isDeployEnvironment } from "./targets.js";
import type { DeployEnvironment } from "./targets.js";
import { DEPLOY_ENVIRONMENTS } from "./targets.js";
import { loadEnvironment } from "./load.js";
import type { LoadEnvironmentOptions } from "./load.js";

/**
 * Deploy tiers whose canonical `.env.<tier>` file exists, in danger order
 * (the same order `DEPLOY_ENVIRONMENTS` is declared in, least- to
 * most-dangerous — see `targets.ts`).
 *
 * ⚠️ Consults `fileFor(tier)` over `DEPLOY_ENVIRONMENTS`, NEVER a glob of
 * `.env*`. `.env.generated` is development's local-stack overlay — written
 * whenever `devtools db start` brings the local Supabase stack up — not a
 * second tier's credentials. Globbing would make a running local stack count
 * as a second tier and trip `resolveSessionTier`'s prompt for everyone who
 * has ever started it; filtering the fixed table by existence is what keeps
 * development counted exactly once.
 */
export async function availableTiers(
  root: string,
  exists?: (relPath: string) => boolean,
): Promise<DeployEnvironment[]> {
  let check = exists;
  if (!check) {
    // Deferred so a caller that always supplies `exists` (every test, and
    // eventually `with-env`'s own hot path) never pays for
    // `node:fs`/`node:path` at all — the same reasoning `load.ts` documents
    // for its own defaults.
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    check = (f) => existsSync(join(root, f));
  }
  return DEPLOY_ENVIRONMENTS.filter((tier) => check(fileFor(tier)));
}

/** A single item in the interactive tier picker. */
export interface TierChoice {
  value: DeployEnvironment;
  label: string;
  hint?: string;
}

export interface ResolveSessionTierOptions {
  /** An explicit `--tier` value, or `undefined` when none was passed. */
  explicit?: string;
  /** Raw `DEPLOY_ENV`; unset or empty is treated as absent, same as `targets.ts`. */
  deployEnv?: string;
  /** Deploy tiers whose env file is present, from `availableTiers()`. */
  available: DeployEnvironment[];
  /** Whether the calling process has an interactive terminal. */
  isTTY: boolean;
  /**
   * Presents the picker and returns the chosen tier. Optional: when absent,
   * ambiguity (2+ tier files present, no explicit `--tier` or `DEPLOY_ENV`
   * answer) can NEVER prompt — it returns an "ambiguous" refusal instead of
   * blocking on a question nobody can answer.
   */
  prompt?: (
    message: string,
    choices: TierChoice[],
  ) => Promise<DeployEnvironment>;
  /** The message shown above the picker, when a prompt is actually shown. */
  promptMessage?: string;
}

/** A resolved tier, or a refusal the caller prints and exits nonzero on. */
export type SessionTierResolution =
  | {
      ok: true;
      tier: DeployEnvironment;
      resolvedBy: "explicit" | "deployEnv" | "sole" | "prompt";
    }
  | { ok: false; reason: string };

/**
 * The ONE tier-selection policy, shared by `with-env` and the devtools
 * launcher.
 *
 *   a. An explicit `--tier` wins outright. Invalid means refusal — it never
 *      falls through to `DEPLOY_ENV` or the prompt, because that would make
 *      `--tier bogus` silently resolve to whatever those said instead of
 *      reporting the typo.
 *   b. Otherwise a non-empty `DEPLOY_ENV` wins. Invalid ALSO means refusal —
 *      mirroring `UnknownEnvironmentError`'s stance in `targets.ts`: a typo
 *      must not run as development, the way falling through to a "default"
 *      tier would let it.
 *   c. Otherwise, with at most one tier file present, there is nothing to
 *      choose between: return it, or `"development"` on a machine that has
 *      never run `env pull` at all. No prompt, ever — the common case for
 *      an ordinary contributor, who has only `.env`.
 *   d. Otherwise (2+ tier files present) this is the signature of someone
 *      working on the deploy workflow itself. Prompt for it, but ONLY when a
 *      `prompt` function was given and the terminal is interactive; picking
 *      a tier whose file is absent is still a refusal, naming `env pull`.
 *      With no prompt, or outside a TTY, refuse instead of guessing — the
 *      message lists the tiers present and the three ways to answer.
 */
export async function resolveSessionTier(
  opts: ResolveSessionTierOptions,
): Promise<SessionTierResolution> {
  if (opts.explicit !== undefined) {
    if (isDeployEnvironment(opts.explicit)) {
      return { ok: true, tier: opts.explicit, resolvedBy: "explicit" };
    }
    return {
      ok: false,
      reason: `unknown tier "${opts.explicit}". Expected: ${DEPLOY_ENVIRONMENTS.join(", ")}.`,
    };
  }

  if (opts.deployEnv !== undefined && opts.deployEnv !== "") {
    if (isDeployEnvironment(opts.deployEnv)) {
      return { ok: true, tier: opts.deployEnv, resolvedBy: "deployEnv" };
    }
    return {
      ok: false,
      reason: `DEPLOY_ENV="${opts.deployEnv}" is not one of ${DEPLOY_ENVIRONMENTS.join(", ")}.`,
    };
  }

  if (opts.available.length <= 1) {
    return {
      ok: true,
      tier: opts.available[0] ?? "development",
      resolvedBy: "sole",
    };
  }

  if (opts.prompt !== undefined && opts.isTTY) {
    // Show every deploy tier, not just the present ones: a tier whose file
    // is missing still appears, with a hint saying so and how to fix it,
    // rather than vanishing from the list where someone who expected to see
    // "production" would wonder if they misconfigured something.
    const choices: TierChoice[] = DEPLOY_ENVIRONMENTS.map((tier) => ({
      value: tier,
      label: tier,
      hint: !opts.available.includes(tier)
        ? `needs env pull --target ${tier}`
        : tier === "development"
          ? "the default"
          : tier === "production"
            ? "⚠️  live data"
            : undefined,
    }));

    const choice = await opts.prompt(
      opts.promptMessage ?? "Which deploy tier?",
      choices,
    );
    if (!opts.available.includes(choice)) {
      return {
        ok: false,
        reason:
          `${fileFor(choice)} is not present — run ` +
          `\`pnpm devtools env pull --target ${choice}\` first.`,
      };
    }
    return { ok: true, tier: choice, resolvedBy: "prompt" };
  }

  return {
    ok: false,
    reason:
      `multiple deploy tiers are present (${opts.available.map(fileFor).join(", ")}) ` +
      "and none was selected. Pass --tier <tier>, set DEPLOY_ENV=<tier>, or run " +
      "through `pnpm devtools` to pick one interactively.",
  };
}

export interface EnterEnvironmentOptions {
  /** Forwarded to `loadEnvironment`; see its own doc for the precedence subtlety. */
  override?: LoadEnvironmentOptions["override"];
}

/** What entering a tier changed, for the caller's mandatory stderr line. */
export interface EnteredEnvironment {
  /** The env files that were applied, in load order. */
  files: string[];
  /** Anomalies worth a stderr line, but not worth refusing to run. */
  warnings: string[];
  /** The FRESH env map `loadEnvironment` produced, now also live on `process.env`. */
  environment: Record<string, string>;
}

/**
 * Enters a deploy tier for the CURRENT process: loads its env files via
 * `loadEnvironment`, applies the resulting map onto `process.env` (plus
 * `DEPLOY_ENV=tier`, so anything reading it afterwards — including a nested
 * `resolveSessionTier` call — sees the tier just entered), and hands back
 * what changed.
 *
 * Deliberately does not print anything: the "loaded … (<tier>)" line is
 * mandatory (see `load.ts`'s `Selection.warnings` and this module's own
 * header) but belongs to the caller, exactly as `loadEnvironment` leaves the
 * stderr line to `with-env`. `MissingEnvFileError` is not caught here either,
 * for the same reason `loadEnvironment` does not catch it: only the caller
 * knows whether a missing file for THIS tier is fatal or survivable.
 */
export async function enterEnvironment(
  tier: DeployEnvironment,
  opts?: EnterEnvironmentOptions,
): Promise<EnteredEnvironment> {
  const loaded = await loadEnvironment(tier, {
    override: opts?.override ?? false,
  });
  for (const [key, value] of Object.entries(loaded.env)) {
    process.env[key] = value;
  }
  process.env.DEPLOY_ENV = tier;
  return {
    files: loaded.files,
    warnings: loaded.warnings,
    environment: loaded.env,
  };
}
