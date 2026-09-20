/**
 * Which env files `with-env` loads. The decision, separated from the doing.
 *
 * `selectEnvFiles()` is pure: environment, file existence and probe result in,
 * ordered file list and warnings out. The CLI wires in the real `existsSync`
 * and the real TCP probe; the tests inject stubs and never open a socket. Keep
 * it that way. The four-row probe table below is the kind of logic that rots
 * when it can only be exercised by spawning processes.
 *
 * ⚠️ This module is exported as the `@devdogsuga/env/load` subpath on purpose.
 * The root `"."` export is imported by `apps/platform`, which deploys to
 * Cloudflare Workers; nothing here may ever be re-exported from `index.ts`, or
 * an `import { selectEnvFiles } from "@devdogsuga/env"` in server code fails at
 * the edge instead of at build. The same is true of `loadEnvironment` below:
 * it dynamically imports `node:fs`/`node:path`/`node:url` and
 * `@dotenvx/dotenvx`, none of which exist at the edge.
 */
import { fileFor, resolveEnvironment } from "./targets.js";
import type { DeployEnvironment } from "./targets.js";

/**
 * The local Supabase API port. Hardcoded to match `supabase/config.toml`,
 * which itself hardcodes 54321 deliberately: `supabase seed` rejects `env()`
 * interpolation in numeric fields, so the port cannot come from the
 * environment on either side. The file is committed; the number is stable.
 */
export const LOCAL_STACK_PORT = 54321;

/** The local-stack connection overlay, written by `start-local-stack`. */
export const GENERATED_FILE = ".env.generated";

/**
 * Wrangler's local Hyperdrive emulator does not read an application's DB_URL.
 * It requires this binding-specific process variable instead. Keep DB_URL as
 * the repository's one source of database credentials and derive Wrangler's
 * alias only in the child-process environment.
 */
export const HYPERDRIVE_LOCAL_CONNECTION_ENV =
  "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";

export function applyWranglerLocalDatabaseAlias(
  environment: Record<string, string>,
): void {
  if (
    environment[HYPERDRIVE_LOCAL_CONNECTION_ENV] === undefined &&
    environment.DB_URL !== undefined
  ) {
    environment[HYPERDRIVE_LOCAL_CONNECTION_ENV] = environment.DB_URL;
  }
}

/**
 * A selected environment's file is missing. The message names the file and the
 * command that materialises it, because "ENOENT: .env.staging" tells a new
 * contributor nothing about `env pull`.
 *
 * ⚠️ The named command has to actually produce the named file. It did not
 * before: this said `secrets pull --env staging`, whose `--env` was the VAULT
 * vocabulary. So it wrote staging's values into the development `.env`, the
 * file that may hold the only copy of somebody's production credentials, and
 * left `.env.staging` still missing, so the error repeated. `--target` now
 * defaults the file from the same table this message reads.
 */
export class MissingEnvFileError extends Error {
  constructor(
    readonly environment: DeployEnvironment,
    readonly file: string,
  ) {
    super(
      environment === "development"
        ? // `pnpm devtools setup` now, and the change is not cosmetic. This
          // message used to name the root `setup` alias BECAUSE it is only
          // ever seen when there is no `.env`, and `pnpm devtools` ran under
          // the `with-env` wrapper, which back when a missing file was fatal
          // would have failed here exactly as its caller just did. So the
          // advice had to point at an unwrapped entry point.
          //
          // The wrapper reports the absence and continues (see `cli.ts`), so
          // the wrapped entry reaches `setup` fine and there is one door to
          // name. This is one of the first things a clean clone prints.
          `${file} does not exist. Run \`pnpm devtools setup\` to create it.`
        : `${file} does not exist. Run ` +
            `\`pnpm devtools env pull --target ${environment}\` to fetch it.`,
    );
    this.name = "MissingEnvFileError";
  }
}

export interface Selection {
  environment: DeployEnvironment;
  /** Env files to load, in order. First file wins under dotenvx. */
  files: string[];
  /** Anomalies worth a stderr line, but not worth refusing to run. */
  warnings: string[];
}

export interface SelectionContext {
  /** Raw `DEPLOY_ENV`; unset/empty means development. */
  deployEnv: string | undefined;
  /** File existence relative to the repo root: `existsSync` or a stub. */
  exists: (file: string) => boolean;
  /**
   * Is anything listening on the local stack port? Only invoked when the
   * environment is development, so tests can assert it stays uncalled for
   * staging/production.
   */
  probeLocalStack: () => boolean | Promise<boolean>;
}

/**
 * Resolves `DEPLOY_ENV` and decides which files to load.
 *
 * Throws `UnknownEnvironmentError` for anything outside the allowlist (never
 * fall through to `.env.${DEPLOY_ENV}`: `DEPLOY_ENV=example` would load the
 * committed placeholder file, largely pass validation, and boot an app pointed
 * at nothing) and `MissingEnvFileError` when the selected file is absent.
 *
 * ⚠️ `.env.generated` IS DEVELOPMENT-ONLY, and the design doc's probe table
 * does not say so because it never imagines otherwise. The overlay holds a
 * local Docker container's connection block, and under `DEPLOY_ENV=staging` or
 * `production` a running container must never shadow the deployed connection
 * values: first-file-wins would silently point a staging build at localhost.
 * So the whole table below is gated on `development`.
 *
 * The probe table (file is a hint; the port is the truth):
 *
 *   | `.env.generated` | port 54321 | behaviour                             |
 *   |------------------|------------|---------------------------------------|
 *   | exists           | listening  | prepend it, a first-file-wins overlay |
 *   | exists           | refused    | ignore it, warn: stale                |
 *   | missing          | listening  | warn: regenerate it                   |
 *   | missing          | refused    | hosted project, silent, also normal   |
 *
 * No file-existence rule can distinguish the middle two rows; that is the
 * entire reason the probe exists.
 */
export async function selectEnvFiles(
  ctx: SelectionContext,
): Promise<Selection> {
  const environment = resolveEnvironment(ctx.deployEnv);
  const envFile = fileFor(environment);

  // Fail on the missing base file before probing: the overlay is meaningless
  // without the `.env` it overlays, and every environment needs its own file
  // (they are standalone by design, with no shared base to fall back to).
  if (!ctx.exists(envFile)) throw new MissingEnvFileError(environment, envFile);

  const files = [envFile];
  const warnings: string[] = [];

  if (environment === "development") {
    const generated = ctx.exists(GENERATED_FILE);
    const listening = await ctx.probeLocalStack();
    if (generated && listening) {
      // dotenvx applies the first file that defines a variable, so the
      // local-stack overlay must precede .env to win.
      files.unshift(GENERATED_FILE);
    } else if (generated) {
      warnings.push(
        `ignoring stale ${GENERATED_FILE} — nothing is listening on ` +
          `127.0.0.1:${LOCAL_STACK_PORT}, so the local stack is not running.`,
      );
    } else if (listening) {
      warnings.push(
        `the local stack is listening on 127.0.0.1:${LOCAL_STACK_PORT} but ` +
          `${GENERATED_FILE} is missing — run ` +
          `\`supabase status -o env > ${GENERATED_FILE}\` at the repo root ` +
          `to regenerate it.`,
      );
    }
  }

  return { environment, files, warnings };
}

/**
 * The real probe: one TCP connect to 127.0.0.1:54321.
 *
 * On loopback a refused connection returns ECONNREFUSED immediately, so the
 * hosted-project path costs well under a millisecond. The timeout is for the
 * pathological case, a firewall that drops instead of refusing, and is kept
 * tight so a weird network stack cannot stall every script in the repo by more
 * than a quarter second.
 *
 * Accepted hole (recorded in the design doc): something *else* listening on
 * 54321 fools this. Proving identity would mean an HTTP round-trip on every
 * command, and that failure is loud and immediate rather than silent.
 */
export async function probeLocalStack(
  port: number = LOCAL_STACK_PORT,
  timeoutMs = 250,
): Promise<boolean> {
  const { connect } = await import("node:net");
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const settle = (up: boolean): void => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}

/**
 * Walks up from THIS module's directory for the workspace marker, mirroring
 * `cli.ts`'s own `findRoot`. The duplication is deliberate rather than a
 * shared export: `cli.ts` still needs its own root synchronously, before it
 * can decide the Windows dotenvx-CLI `-f` paths below, and passing that same
 * root through as `context.root` (as `with-env` now does) is what lets a
 * caller skip this walk entirely rather than paying for it twice.
 *
 * Throws instead of `console.error` + `process.exit`, unlike `cli.ts`'s
 * version: this is a library function other commands call in-process, and
 * exiting the whole process out from under an unrelated caller would be a far
 * worse failure than a rejected promise.
 */
async function findRepoRoot(): Promise<string> {
  const { existsSync } = await import("node:fs");
  const { dirname, join, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  let dir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        "loadEnvironment: could not locate the monorepo root " +
          "(no pnpm-workspace.yaml found above this package).",
      );
    }
    dir = parent;
  }
}

/** The result of `loadEnvironment`: what was selected, and what it produced. */
export interface LoadedEnvironment {
  environment: DeployEnvironment;
  /** The env files that were applied, in load order. First file wins (unless override). */
  files: string[];
  /**
   * A FRESH string-only env map: a snapshot of process.env with the selected
   * files applied and the Wrangler Hyperdrive alias derived. process.env is
   * NEVER mutated.
   */
  env: Record<string, string>;
  warnings: string[];
}

export interface LoadEnvironmentOptions {
  /**
   * When true, the selected files OVERRIDE values already present in the base
   * snapshot; when false (the default) existing values win (dotenvx's
   * first-file-wins, which `with-env` relies on so a shell var beats the file).
   *
   * Re-entrant callers loading a DIFFERENT tier than the process already runs
   * under MUST pass true: `pnpm devtools` itself runs under `with-env`
   * (development), so its process.env already holds development's values, and
   * without override a `loadEnvironment("staging")` would keep development's
   * BASE_URL/DB_URL instead of staging's.
   */
  override?: boolean;
}

/**
 * Loads a deploy tier's env files into a FRESH map, in-process — the same
 * selection-then-load `with-env` does at startup (`selectEnvFiles` here plus
 * dotenvx's Node API), pulled out so any command can load a tier's
 * environment WITHOUT re-execing itself through the `with-env` bin.
 *
 * ⚠️ NODE-ONLY / EDGE-UNSAFE, same as the rest of this module: never
 * re-export this from `index.ts`. It dynamically imports
 * `node:fs`/`node:path`/`node:url` (only when `context.root` or
 * `context.exists` is not supplied) and `@dotenvx/dotenvx` (only when files
 * are actually applied), none of which resolve at the Cloudflare Workers edge
 * `apps/platform` deploys to.
 *
 * `process.env` (or `context.baseEnv`) is read, never written: `env` on the
 * result is a new object built from a snapshot of it, so loading one tier
 * in-process can never leak into, or be clobbered by, a caller's own
 * `process.env`.
 *
 * `MissingEnvFileError` and `UnknownEnvironmentError` from `selectEnvFiles`
 * are NOT caught here — they propagate. Only `with-env` knows how to survive
 * a missing file (report it, continue with none loaded); a library function
 * deciding that on every caller's behalf would take away the choice.
 *
 * See `LoadEnvironmentOptions.override` for the precedence subtlety: the
 * default (false) matches `with-env`'s "a shell var beats the file", which is
 * only correct when the caller is loading the SAME tier the process already
 * runs under. A caller loading a DIFFERENT tier — one that did not shape
 * `process.env` — must pass `override: true`, or that tier's file loses to
 * values that were never meant to apply to it.
 */
export async function loadEnvironment(
  deployEnv?: string,
  options?: LoadEnvironmentOptions,
  // OPTIONAL injected edges for tests — production callers pass nothing and
  // get the real filesystem, probe, and dotenvx. Mirrors selectEnvFiles's
  // design.
  context?: {
    root?: string;
    exists?: (file: string) => boolean;
    probeLocalStack?: () => boolean | Promise<boolean>;
    applyEnvFiles?: (
      paths: string[],
      target: Record<string, string>,
      override: boolean,
    ) => void | Promise<void>;
    baseEnv?: NodeJS.ProcessEnv;
  },
): Promise<LoadedEnvironment> {
  const override = options?.override ?? false;
  const root = context?.root ?? (await findRepoRoot());

  let exists = context?.exists;
  if (!exists) {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    exists = (file: string) => existsSync(join(root, file));
  }

  const selection = await selectEnvFiles({
    deployEnv,
    exists,
    probeLocalStack: context?.probeLocalStack ?? (() => probeLocalStack()),
  });

  // A FRESH string-only snapshot. Both dotenvx and (eventually) @yarnpkg/shell
  // want string-only maps, so drop the unset keys Node models as undefined —
  // the same loop `with-env` uses — and never touch the source object.
  const base = context?.baseEnv ?? process.env;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) env[key] = value;
  }

  // `selectEnvFiles` never returns on success with an empty list — it throws
  // `MissingEnvFileError` before that, since every environment needs its own
  // base file — so this guard cannot fire from a real selection. It mirrors
  // `with-env`'s own early return in spirit anyway: skipping the call rather
  // than passing an empty `path` keeps dotenvx from falling back to its own
  // default `.env` lookup, for any injected `context` that manages to defy
  // the invariant.
  if (selection.files.length > 0) {
    const { join } = await import("node:path");
    const applyEnvFiles =
      context?.applyEnvFiles ??
      (async (paths, target, overrideExisting) => {
        const { default: dx } = await import("@dotenvx/dotenvx");
        dx.config({
          // ⚠️ dotenvx's `overload` is LAST-file-wins, but our file list is
          // FIRST-file-wins: `selectEnvFiles` puts `.env.generated` (the
          // running local stack's connection overlay) AHEAD of `.env` so it
          // beats it. Under overload, passing the list as-is would let `.env`
          // clobber that overlay — pointing a local wrangler session at the
          // hosted database. Reverse under overload so the first file still
          // wins while the files as a group still override the ambient env.
          path: overrideExisting ? [...paths].reverse() : paths,
          processEnv: target,
          quiet: true,
          overload: overrideExisting,
        });
      });
    await applyEnvFiles(
      selection.files.map((file) => join(root, file)),
      env,
      override,
    );
  }

  applyWranglerLocalDatabaseAlias(env);

  return {
    environment: selection.environment,
    files: selection.files,
    env,
    warnings: selection.warnings,
  };
}
