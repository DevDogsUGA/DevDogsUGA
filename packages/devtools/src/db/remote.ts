/**
 * Resolves the hosted database a `--target remote` db command should act on.
 *
 * ⚠️ SAFETY-CRITICAL. This is what `db reset --target remote` acts on, and
 * `db reset` drops and re-migrates whatever database it is pointed at. Every
 * remote db operation used to point at whatever project the supabase CLI
 * happened to have linked (`supabase link`, remembered on disk), via `db …
 * --linked` — one ambient answer, unaware that this CLI already has a tier
 * concept (`devtools env pull --target staging|production`, `DEPLOY_ENV`).
 * `--linked` and "the entered tier" can name two different projects with
 * nothing here to notice.
 *
 * This resolver makes "which database?" an explicit question with a provable
 * answer instead: a deploy tier (staging or production — `development` is the
 * local stack and is never a remote target), loaded the same way
 * `resolveTier` and its callers (`cron run`, `workflows run`) already load
 * one, and the `DB_URL`/`PROJECT_REF` that tier's own `.env.<tier>` file
 * names.
 *
 * Order of resolution, cheapest and least surprising first:
 *
 *   1. an explicit `--tier` — refused if it names `development` or anything
 *      unrecognised, so a typo cannot silently fall through to a prompt;
 *   2. the tier this process already entered (`DEPLOY_ENV`), the same way an
 *      already-answered question is honoured elsewhere in this CLI;
 *   3. if no deployed tier's env file exists at all, an error pointing at
 *      `env pull`;
 *   4. if exactly one does, that one — nothing to choose between;
 *   5. if more than one does, a prompt on a TTY (staging listed before
 *      production, so a reflexive Enter cannot land on it), or a refusal
 *      naming `--tier` off one.
 *
 * Reports the reason on stderr and returns `null` on every failure path —
 * never throws for an expected failure — so a caller can stop without
 * printing a second explanation of its own. The same contract `resolveTier`
 * keeps.
 */
import { select } from "@clack/prompts";
import {
  DEPLOY_ENVIRONMENTS,
  fileFor,
  isDeployEnvironment,
} from "@devdogsuga/env";
import type { DeployEnvironment } from "@devdogsuga/env";
import {
  loadEnvironment,
  MissingEnvFileError,
  type LoadedEnvironment,
} from "@devdogsuga/env/load";
import { availableTiers } from "../tier.js";
import { unwrap } from "../ui.js";

/** Every deploy tier except `development` — the ones a hosted project, and
 * therefore `--target remote`, could possibly mean. */
const DEPLOYED_TIERS = DEPLOY_ENVIRONMENTS.filter(
  (tier): tier is Exclude<DeployEnvironment, "development"> =>
    tier !== "development",
);

/** What `--target remote` resolved to: the tier, and the two facts its env
 * file carries that every remote db operation needs. `projectRef` can be
 * `undefined` — not every remote op needs it (`db reset`'s `--db-url` does
 * not), so its absence is validated where it is actually used, not here. */
export interface RemoteConnection {
  tier: DeployEnvironment;
  dbUrl: string;
  projectRef: string | undefined;
}

interface ResolveRemoteConnectionOptions {
  /** Stderr prefix, e.g. "devtools db reset". */
  label?: string;
  /** Injectable for tests; defaults to `availableTiers()`. */
  available?: DeployEnvironment[];
  /** Injectable for tests; defaults to `process.env.DEPLOY_ENV`. */
  deployEnv?: string;
  /** Injectable for tests; defaults to `process.stdin.isTTY`. */
  isTTY?: boolean;
  /** Injectable for tests; defaults to a clack `select` wrapped in `unwrap`. */
  prompt?: (
    message: string,
    choices: { value: DeployEnvironment; label: string; hint?: string }[],
  ) => Promise<DeployEnvironment>;
  /** Injectable for tests; defaults to the real `loadEnvironment`. */
  loadEnvironment?: typeof loadEnvironment;
}

/**
 * The same tiny `--flag value` reader every other command module in this CLI
 * keeps its own copy of (see `cli.ts`, `ci.ts`, `emails/commands.ts`, …)
 * rather than sharing one: it is three lines, and a shared import would be
 * the only reason this module needs to know about `cli.ts` at all.
 */
function flagValue(rest: readonly string[], flag: string): string | undefined {
  const index = rest.indexOf(flag);
  if (index === -1) return undefined;
  const value = rest[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

export async function resolveRemoteConnection(
  rest: readonly string[],
  opts: ResolveRemoteConnectionOptions = {},
): Promise<RemoteConnection | null> {
  const label = opts.label ?? "devtools db";

  const present = opts.available ?? availableTiers();
  const deployed = present.filter((tier) => tier !== "development");

  let tier: DeployEnvironment;

  const given = flagValue(rest, "--tier");
  if (given !== undefined) {
    if (!isDeployEnvironment(given) || given === "development") {
      process.stderr.write(
        `${label}: --tier ${given} is not a deployed tier. Expected: ${DEPLOYED_TIERS.join(", ")}.\n`,
      );
      return null;
    }
    tier = given;
  } else {
    // Already inside a deployed tier? Honour it, exactly as `resolveTier`
    // honours an entered tier over asking again — the wizard enters one once,
    // up front, for the whole session. `development` is excluded here even
    // though `resolveTier` would accept it: this resolver only ever answers
    // "which HOSTED project", and development names none.
    const entered = opts.deployEnv ?? process.env.DEPLOY_ENV;
    if (
      entered !== undefined &&
      entered !== "" &&
      isDeployEnvironment(entered) &&
      entered !== "development"
    ) {
      tier = entered;
    } else if (deployed.length === 0) {
      process.stderr.write(
        `${label} --target remote needs a deployed tier's env file; run ` +
          "`pnpm devtools env pull --target staging` (or production) first.\n",
      );
      return null;
    } else if (deployed.length === 1) {
      // Nothing to choose between.
      tier = deployed[0]!;
    } else {
      const isTTY = opts.isTTY ?? process.stdin.isTTY;
      if (!isTTY) {
        process.stderr.write(
          `${label} --target remote: multiple deployed tiers present; pass --tier staging|production.\n`,
        );
        return null;
      }

      const prompt =
        opts.prompt ??
        (async (message, choices) =>
          unwrap(
            await select<DeployEnvironment>({ message, options: choices }),
          ));

      // Staging first — `deployed` already carries `DEPLOY_ENVIRONMENTS`'s
      // danger order — so a reflexive Enter on this prompt cannot land on
      // production.
      tier = await prompt(
        "Which deployed tier's database?",
        deployed.map((t) => ({
          value: t,
          label: t,
          hint: t === "production" ? "⚠️  live data" : undefined,
        })),
      );
    }
  }

  const load = opts.loadEnvironment ?? loadEnvironment;
  let loaded: LoadedEnvironment;
  try {
    // override: true — this process runs under `with-env` (development), so
    // process.env already holds development's values; the deployed tier
    // picked above must win over whatever this process inherited, the same
    // reasoning `cron run`/`workflows run` give at their own `loadEnvironment`
    // calls.
    loaded = await load(tier, { override: true });
  } catch (err) {
    if (err instanceof MissingEnvFileError) {
      process.stderr.write(`${label}: ${err.message}\n`);
      return null;
    }
    throw err;
  }

  const dbUrl = loaded.env["DB_URL"];
  if (!dbUrl) {
    process.stderr.write(
      `${label} --target remote: ${fileFor(tier)} has no DB_URL.\n`,
    );
    return null;
  }
  const projectRef = loaded.env["PROJECT_REF"];

  // Enter the tier, so everything else this process does afterward —
  // `db introspect`'s own `DB_URL` read chief among them — sees the SAME
  // database this function just resolved, rather than silently falling back
  // to development's.
  Object.assign(process.env, loaded.env);
  process.env["DEPLOY_ENV"] = tier;

  return { tier, dbUrl, projectRef };
}
