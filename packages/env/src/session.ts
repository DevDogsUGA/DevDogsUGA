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
import { DEV_DB_ENV, isDevDatabase, loadEnvironment } from "./load.js";
import type { DevDatabase, LoadEnvironmentOptions } from "./load.js";

/**
 * The words `--tier` accepts, and the one place they are spelled out. The
 * development qualifiers exist because `staging` and `production` are ALSO
 * remote databases: a bare `local`/`remote` pair would steal the words that
 * describe them. See `DevDatabase` in `load.ts` for what the qualifier means.
 */
export const SESSION_SELECTORS = [
  "development:local",
  "development:remote",
  "staging",
  "production",
] as const;

/** What a `--tier` value (or a picker answer) parsed to. */
export interface SessionSelection {
  tier: DeployEnvironment;
  /** Present only when the selector carried a `development:` qualifier. */
  devDatabase?: DevDatabase;
}

/**
 * Parses one `--tier` word: a plain deploy tier, or a qualified
 * `development:<local|remote>`. Returns `null` for anything else — the
 * CALLER phrases the refusal, because "unknown tier" reads differently on a
 * flag than on a picker answer.
 */
export function parseSessionSelector(value: string): SessionSelection | null {
  const colon = value.indexOf(":");
  if (colon === -1) {
    return isDeployEnvironment(value) ? { tier: value } : null;
  }
  const tier = value.slice(0, colon);
  const qualifier = value.slice(colon + 1);
  if (tier !== "development" || !isDevDatabase(qualifier)) return null;
  return { tier: "development", devDatabase: qualifier };
}

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

/** A single item in the interactive session picker. `value` is a session
 * selector word (`"development:local"`, `"staging"`, …), fed back through
 * `parseSessionSelector` when chosen. */
export interface TierChoice {
  value: string;
  label: string;
  hint?: string;
}

export interface ResolveSessionTierOptions {
  /** An explicit `--tier` value, or `undefined` when none was passed. Any
   * word `SESSION_SELECTORS` names, plus bare `development` (disambiguated
   * by `remoteCandidate` below). */
  explicit?: string;
  /** Raw `DEPLOY_ENV`; unset or empty is treated as absent, same as `targets.ts`. */
  deployEnv?: string;
  /** Raw `DEV_DB`; unset or empty is treated as absent. Only consulted when
   * the tier resolves to development without a qualifier of its own. */
  devDb?: string;
  /** Deploy tiers whose env file is present, from `availableTiers()`. */
  available: DeployEnvironment[];
  /** Whether the calling process has an interactive terminal. */
  isTTY: boolean;
  /**
   * Whether `.env` names a remote development database, and where it points
   * (a hostname, for the picker's hint) — from `developmentRemoteCandidate`.
   *
   * ⚠️ `undefined` means the CALLER DID NOT LOOK, and selects the legacy
   * behaviour: bare `development` resolves with no qualifier and the load
   * probe decides, exactly as it always has. `with-env` passes `undefined`
   * on purpose — it fronts non-interactive scripts that must not start
   * refusing on machines whose `.env` holds a DB_URL. `null` means the
   * caller looked and there is no candidate (development can only mean the
   * local stack, still resolved as legacy-probe so a stopped stack does not
   * refuse commands that never touch the database). A string means both
   * development databases are real, and bare `development` must be
   * disambiguated: asked interactively, refused otherwise.
   */
  remoteCandidate?: string | null;
  /** Whether the local stack answered the port probe — only ever used to
   * phrase the `development:local` hint, never to decide anything. */
  localStackOnline?: boolean;
  /**
   * Presents the picker and returns the chosen value. Optional: when absent,
   * ambiguity (2+ session choices, nothing answering) can NEVER prompt — it
   * returns an "ambiguous" refusal instead of blocking on a question nobody
   * can answer.
   */
  prompt?: (message: string, choices: TierChoice[]) => Promise<string>;
  /** The message shown above the picker, when a prompt is actually shown. */
  promptMessage?: string;
}

/** A resolved session, or a refusal the caller prints and exits nonzero on. */
export type SessionTierResolution =
  | {
      ok: true;
      tier: DeployEnvironment;
      /** See `DevDatabase`. Absent means the load probe decides, as ever. */
      devDatabase?: DevDatabase;
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
 *   d. Otherwise (2+ session choices present) this is the signature of
 *      someone working on the deploy workflow itself. Prompt for it, but
 *      ONLY when a `prompt` function was given and the terminal is
 *      interactive; picking a tier whose file is absent is still a refusal,
 *      naming `env pull`. With no prompt, or outside a TTY, refuse instead
 *      of guessing — the message lists the choices present and the ways to
 *      answer.
 *
 * Wherever a resolution lands on `development`, one more question can
 * remain — WHICH development database (see `DevDatabase`). A qualified
 * selector (`development:local|remote`) answers it outright; then a valid
 * `DEV_DB`; then, when the caller looked and found a remote candidate
 * (`remoteCandidate` a string), the same ask-or-refuse discipline as the
 * tier itself; with no candidate (or a caller that did not look), the
 * qualifier stays absent and the load probe decides, as it always has.
 */
export async function resolveSessionTier(
  opts: ResolveSessionTierOptions,
): Promise<SessionTierResolution> {
  if (opts.explicit !== undefined) {
    const parsed = parseSessionSelector(opts.explicit);
    if (parsed === null) {
      return {
        ok: false,
        reason:
          `unknown tier "${opts.explicit}". Expected: development, ` +
          `${SESSION_SELECTORS.join(", ")}.`,
      };
    }
    if (parsed.tier !== "development" || parsed.devDatabase !== undefined) {
      return { ok: true, ...parsed, resolvedBy: "explicit" };
    }
    return qualifyDevelopment(opts, "explicit");
  }

  if (opts.deployEnv !== undefined && opts.deployEnv !== "") {
    if (!isDeployEnvironment(opts.deployEnv)) {
      return {
        ok: false,
        reason: `DEPLOY_ENV="${opts.deployEnv}" is not one of ${DEPLOY_ENVIRONMENTS.join(", ")}.`,
      };
    }
    if (opts.deployEnv !== "development") {
      return { ok: true, tier: opts.deployEnv, resolvedBy: "deployEnv" };
    }
    return qualifyDevelopment(opts, "deployEnv");
  }

  if (opts.available.length <= 1) {
    const tier = opts.available[0] ?? "development";
    if (tier !== "development") return { ok: true, tier, resolvedBy: "sole" };
    return qualifyDevelopment(opts, "sole");
  }

  if (opts.prompt !== undefined && opts.isTTY) {
    // Show every deploy tier, not just the present ones: a tier whose file
    // is missing still appears, with a hint saying so and how to fix it,
    // rather than vanishing from the list where someone who expected to see
    // "production" would wonder if they misconfigured something.
    // `development` expands into its two qualified rows exactly when both
    // development databases are real (the caller looked and found a remote
    // candidate), so the split is in the option names, not just the hints —
    // `staging` and `production` are also "remote", and a bare local/remote
    // pair would steal their words.
    const choices: TierChoice[] = DEPLOY_ENVIRONMENTS.flatMap(
      (tier): TierChoice[] => {
        if (!opts.available.includes(tier)) {
          return [
            {
              value: tier,
              label: tier,
              hint: `needs env pull --target ${tier}`,
            },
          ];
        }
        if (tier === "development") {
          if (typeof opts.remoteCandidate !== "string") {
            return [{ value: tier, label: tier, hint: "the default" }];
          }
          return [
            {
              value: "development:local",
              label: "development:local",
              hint: `Docker stack${localStackHint(opts.localStackOnline)}`,
            },
            {
              value: "development:remote",
              label: "development:remote",
              hint: opts.remoteCandidate,
            },
          ];
        }
        return [
          {
            value: tier,
            label: tier,
            hint: tier === "production" ? "⚠️  live data" : undefined,
          },
        ];
      },
    );

    const choice = await opts.prompt(
      opts.promptMessage ?? "Which environment should this session use?",
      choices,
    );
    const parsed = parseSessionSelector(choice);
    if (parsed === null) {
      // Only reachable through an injected prompt returning something not on
      // the list; refuse the same way an explicit typo is refused.
      return { ok: false, reason: `unknown tier "${choice}".` };
    }
    if (!opts.available.includes(parsed.tier)) {
      return {
        ok: false,
        reason:
          `${fileFor(parsed.tier)} is not present — run ` +
          `\`pnpm devtools env pull --target ${parsed.tier}\` first.`,
      };
    }
    return { ok: true, ...parsed, resolvedBy: "prompt" };
  }

  return {
    ok: false,
    reason:
      `multiple deploy tiers are present (${opts.available.map(fileFor).join(", ")}) ` +
      `and none was selected. Pass --tier <tier> (${SESSION_SELECTORS.join(", ")}), ` +
      "set DEPLOY_ENV=<tier>, or run through `pnpm devtools` to pick one " +
      "interactively.",
  };
}

function localStackHint(online: boolean | undefined): string {
  if (online === undefined) return "";
  return online ? " · online" : " · offline";
}

/**
 * The development-database half of the policy, for a resolution that landed
 * on bare `development`: `DEV_DB` answers it; otherwise a remote candidate
 * makes it a real question (asked on a TTY, refused off one); otherwise the
 * qualifier stays absent and the load probe decides. See
 * `ResolveSessionTierOptions.remoteCandidate` for why "the caller did not
 * look" and "the caller looked and found nothing" both resolve unqualified.
 */
async function qualifyDevelopment(
  opts: ResolveSessionTierOptions,
  resolvedBy: "explicit" | "deployEnv" | "sole",
): Promise<SessionTierResolution> {
  if (opts.devDb !== undefined && opts.devDb !== "") {
    if (!isDevDatabase(opts.devDb)) {
      return {
        ok: false,
        reason: `${DEV_DB_ENV}="${opts.devDb}" is not one of: local, remote.`,
      };
    }
    return {
      ok: true,
      tier: "development",
      devDatabase: opts.devDb,
      resolvedBy,
    };
  }

  if (typeof opts.remoteCandidate !== "string") {
    return { ok: true, tier: "development", resolvedBy };
  }

  if (opts.prompt !== undefined && opts.isTTY) {
    const choice = await opts.prompt("Which development database?", [
      {
        value: "development:local",
        label: "development:local",
        hint: `Docker stack${localStackHint(opts.localStackOnline)}`,
      },
      {
        value: "development:remote",
        label: "development:remote",
        hint: opts.remoteCandidate,
      },
    ]);
    const parsed = parseSessionSelector(choice);
    if (parsed === null || parsed.tier !== "development") {
      return { ok: false, reason: `unknown development database "${choice}".` };
    }
    return { ok: true, ...parsed, resolvedBy: "prompt" };
  }

  return {
    ok: false,
    reason:
      "`development` is ambiguous here: .env names a remote database " +
      `(${opts.remoteCandidate}) and the Docker stack is a second one. Pass ` +
      "--tier development:local or --tier development:remote (or set " +
      `${DEV_DB_ENV}=local|remote).`,
  };
}

export interface EnterEnvironmentOptions {
  /** Forwarded to `loadEnvironment`; see its own doc for the precedence subtlety. */
  override?: LoadEnvironmentOptions["override"];
  /** Forwarded to `loadEnvironment`, and exported as `DEV_DB` on success so
   * child processes inherit the session's answer. See `DevDatabase`. */
  devDatabase?: DevDatabase;
}

/**
 * Whether `.env` names a remote development database, and where it points:
 * the `DB_URL` hostname for the picker's `development:remote` hint, or
 * `null` when there is no `.env`, no `DB_URL`, or an empty one. A `DB_URL`
 * whose value does not parse as a URL still counts — it would still be used
 * — and reports a placeholder host rather than vanishing from the choices.
 *
 * Reads the file directly (through dotenvx's parser, never a hand-rolled
 * one) rather than `loadEnvironment`: the whole point is to see what `.env`
 * ITSELF says before any overlay or ambient value has had a say.
 */
export async function developmentRemoteCandidate(
  root: string,
): Promise<string | null> {
  const { existsSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const path = join(root, fileFor("development"));
  if (!existsSync(path)) return null;
  let dbUrl: string | undefined;
  try {
    const { default: dx } = await import("@dotenvx/dotenvx");
    const parsed = dx.parse(readFileSync(path, "utf8")) as Record<
      string,
      string | undefined
    >;
    dbUrl = parsed.DB_URL;
  } catch {
    return null;
  }
  if (dbUrl === undefined || dbUrl === "") return null;
  try {
    return new URL(dbUrl).hostname || "a remote database";
  } catch {
    return "a remote database";
  }
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
    devDatabase: opts?.devDatabase,
  });
  for (const [key, value] of Object.entries(loaded.env)) {
    process.env[key] = value;
  }
  process.env.DEPLOY_ENV = tier;
  // Exported alongside DEPLOY_ENV for the same reason it is: a session that
  // answered "which development database" must hand children the SAME
  // answer, or a nested `with-env` re-runs the probe and can disagree.
  if (opts?.devDatabase !== undefined) {
    process.env[DEV_DB_ENV] = opts.devDatabase;
  }
  return {
    files: loaded.files,
    warnings: loaded.warnings,
    environment: loaded.env,
  };
}
