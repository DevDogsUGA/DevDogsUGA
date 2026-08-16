/**
 * Which env files `with-env` loads — the decision, separated from the doing.
 *
 * `selectEnvFiles()` is pure: environment × file-existence × probe-result in,
 * ordered file list + warnings out. The CLI wires in the real `existsSync` and
 * the real TCP probe; the tests inject stubs and never open a socket. Keep it
 * that way — the four-row probe table below is exactly the kind of logic that
 * rots when it can only be exercised by spawning processes.
 *
 * ⚠️ This module is exported as `@devdogsuga/env/load`, a subpath, on purpose.
 * The root `"."` export is imported by `apps/platform`, which deploys to
 * Cloudflare Workers; nothing here may ever be re-exported from `index.ts`,
 * or an innocent `import { selectEnvFiles } from "@devdogsuga/env"` in server
 * code fails at the edge instead of at build.
 */
import { fileFor, resolveEnvironment } from "./targets.js";
import type { DeployEnvironment } from "./targets.js";

/**
 * The local Supabase API port. Hardcoded to match `supabase/config.toml`,
 * which itself hardcodes 54321 deliberately — `supabase seed` rejects `env()`
 * interpolation in numeric fields, so the port cannot come from the
 * environment on either side. The file is committed; the number is stable.
 */
export const LOCAL_STACK_PORT = 54321;

/** The local-stack connection overlay, written by `start-local-stack`. */
export const GENERATED_FILE = ".env.generated";

/**
 * A selected environment's file is missing. The message names the file and
 * the command that materialises it, because "ENOENT: .env.staging" tells a
 * new contributor nothing about `env pull`.
 *
 * ⚠️ The named command has to actually produce the named file. It did not
 * before: this said `secrets pull --env staging`, whose `--env` was the VAULT
 * vocabulary, so it wrote staging's values into the development `.env` — the
 * file that may hold the only copy of somebody's production credentials — and
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
        ? `${file} does not exist. Run \`pnpm devtools setup\` to create it.`
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
  /** File existence relative to the repo root — `existsSync` or a stub. */
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
 * fall through to `.env.${DEPLOY_ENV}` — `DEPLOY_ENV=example` would load the
 * committed placeholder file, largely pass validation, and boot an app
 * pointed at nothing) and `MissingEnvFileError` when the selected file is
 * absent.
 *
 * ⚠️ `.env.generated` IS DEVELOPMENT-ONLY, and the design doc's probe table
 * does not say so because it never imagines otherwise: the overlay holds a
 * local Docker container's connection block, and under `DEPLOY_ENV=staging`
 * or `production` a running container must never shadow the deployed
 * connection values — first-file-wins would silently point a staging build
 * at localhost. So the whole table below is gated on `development`.
 *
 * The probe table (file is a hint; the port is the truth):
 *
 *   | `.env.generated` | port 54321 | behaviour                              |
 *   |------------------|------------|----------------------------------------|
 *   | exists           | listening  | prepend it — first-file-wins overlay   |
 *   | exists           | refused    | ignore it, warn: stale                 |
 *   | missing          | listening  | warn: regenerate it                    |
 *   | missing          | refused    | hosted project, silently — also normal |
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
  // (they are standalone by design — no shared base to fall back to).
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
 * hosted-project path costs well under a millisecond. The timeout exists for
 * the pathological case — a firewall that drops instead of refusing — and is
 * kept tight so a weird network stack cannot stall every script in the repo
 * by a quarter second, let alone longer.
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
