/**
 * `devtools deploy write-env [--source <manifest>]`
 *
 * Materialises `.env.staging` / `.env.production` inside a deploy job.
 *
 * Everything downstream of this command reads its configuration through
 * `with-env`, which reads a file on disk: `cf:build:*`, `cf:deploy:*`,
 * `deploy:*`, `deploy secrets-file`, `deploy mint-token`. CI has no such file,
 * so one step has to write it. This is that step, and it is the ONLY place in
 * the pipeline that touches the `secrets` and `vars` contexts. After it runs, a
 * deploy job looks exactly like a devops laptop, and every later step can be
 * the same command a person would run by hand.
 *
 * ## ⚠️ This command cannot be run through `with-env`
 *
 * `pnpm devtools` is `with-env tsx src/cli.ts`, and `with-env` refuses to
 * start when the file for `DEPLOY_ENV` is absent. That file is the one this
 * command is about to create, so routing it the ordinary way is a bootstrap
 * cycle: it would die on `MissingEnvFileError` for its own output. Use the
 * package's `cli:no-env` script instead,
 *
 *     pnpm --filter @devdogsuga/devtools run cli:no-env deploy write-env
 *
 * the same entry point with the `with-env` wrapper removed, and how
 * `deploy.yaml` invokes it. (`pnpm devtools env example --check` already routes
 * through `cli:no-env` for the mirror-image reason: it must run in a job that
 * deliberately has no env file.) Nothing here reads the ambient environment
 * apart from `DEPLOY_ENV` and the two context variables the workflow sets on
 * the step, so there is nothing for `with-env` to have supplied.
 *
 * ## Where the values come from
 *
 *   secret     `${{ secrets.* }}` for the environment, written by a human
 *              running `pnpm devtools env push`. CI never reads Bitwarden.
 *   variable   `${{ vars.* }}`, the per-environment values that are NOT
 *              secrets (`PROJECT_REF`, `BASE_URL`, `PUBLISHABLE_KEY`, …).
 *   derived    an `example` metadata entry that is a `$VAR` formula rather than
 *              a placeholder: `API_URL` is `https://$PROJECT_REF.supabase.co`
 *              and always has been. Security plan §A.4: "derived at deploy
 *              time from PROJECT_REF, never stored".
 *   committed  a `scope: "default"` value, identical in every environment and
 *              carried in the registry (`GITHUB_ORG`, the avatars bucket).
 *
 * ⚠️ A literal `example` on a `scope: "environment"` key is NOT a fallback.
 * `BASE_URL`'s example is `http://localhost:3000` and `GH_APP_ID`'s is
 * `000000`: both are the shape of a working development file, and taking
 * either as a deploy default would ship a production Worker pointed at
 * localhost with nothing anywhere saying so. Only a `$`-formula (a derivation)
 * and a `scope: "default"` constant qualify, which is why the two cases are
 * separated above rather than collapsed into "use the example".
 *
 * ## The completeness check is the point
 *
 * Security plan §A.6: the deploy build needs the ENTIRE server schema, because
 * `@t3-oss/env` validates the whole thing on import and the platform
 * prerenders pages that resolve their gate at build time. So the interesting
 * failure is a missing value, not a wrong one. GitHub hands a missing secret to
 * a workflow as an EMPTY STRING rather than an error (§A.7's closing warning).
 *
 * Rather than trust that, this refuses to write a file that would fail the
 * build, and names every key it could not resolve along with where that key
 * was supposed to come from. "Required" is derived, not listed: a schema that
 * rejects `undefined` is required, one with `.optional()` or `.default()` is
 * not. That is the same registry the apps validate against, so the two cannot
 * drift.
 *
 * ## Refusals
 *
 * `neverStoreKeys()` appearing in either context is a hard failure. It is
 * mostly unreachable, since `env push` will not upload one, but this is the
 * last place to catch a `BWS_ACCESS_TOKEN` added to the repository by hand,
 * and the cost of missing it is every secret the project holds (see the long
 * comment on the declaration in `packages/devtools/env.ts`).
 *
 * Writing uses `{ flag: "wx" }`, the same atomic refusal `env init` uses.
 * On a runner the file never exists; on a laptop it is the devops copy of the
 * production credentials, and a stray run of this command must not be able to
 * overwrite it. `development` is refused outright for the same reason: `.env`
 * is that file.
 *
 * ## `--source <manifest>`
 *
 * Composes only what one manifest declares, and demands ALL of its secrets
 * rather than only its schema-required keys. That is for a step that exists to
 * mutate one thing. `supabase config push` reads `supabase/env.ts` and nothing
 * else, the job runs in a GitHub environment holding a deliberately narrow
 * slice of the credentials, and the interesting failure is an OAuth provider
 * reconfigured without its secret. Every one of those keys is `.optional()` in
 * the schema (an app boots fine without them; only `config.toml` reads them),
 * so schema-required alone would let the push through with a provider
 * half-configured.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  derivationOf,
  fileFor,
  neverStoreKeys,
  resolveEnvironment,
  variables,
  type EnvEntry,
} from "@devdogsuga/env";
import { assertRegistryLoaded } from "../env/discovery.js";
import { PROJECT_ROOT } from "../instance.js";
import { DeployError, summary } from "./report.js";

/** Where a value came from, for the provenance table. */
export type Provenance = "secret" | "variable" | "derived" | "committed";

interface Resolved {
  value: string;
  from: Provenance;
}

export interface WriteEnvOptions {
  /** `--source`: compose only what this manifest declares. */
  source?: string | null;
  /**
   * Directory the env file is written into.
   *
   * The CLI always passes the project root, which is what the workflow means.
   * It is a parameter so the tests can compose into a temporary directory:
   * the real destinations are `.env.staging` and `.env.production`, which on a
   * maintainer's laptop are the files being filled in with live credentials.
   */
  root?: string;
  /** Defaults to the ambient environment; a parameter so tests need not mutate it. */
  env?: NodeJS.ProcessEnv;
}

export interface WriteEnvResult {
  /** The file that was written, relative to `root`. */
  file: string;
  /** Key → where its value came from, in the order they were written. */
  provenance: Map<string, Provenance>;
}

/**
 * `${{ toJSON(secrets) }}` and `${{ toJSON(vars) }}` arrive as JSON objects.
 *
 * Non-string members are dropped rather than coerced: the contexts only ever
 * hold strings, and a `String(value)` here would turn a future shape change
 * into a value like `[object Object]` written to a Worker.
 */
function readContext(
  name: string,
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new DeployError(`${name} is not valid JSON.`, [String(cause)]);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DeployError(`${name} is not a JSON object.`);
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    // An empty value is treated as absent throughout this toolchain: it reads
    // as "configured" to every consumer that checks for presence, which is
    // worse than nothing being there. Same rule as `selectForPush`.
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

/**
 * The value the registry itself supplies, or `null` when it supplies none.
 *
 * The derivation half is `derivationOf()` in `@devdogsuga/env` rather than a
 * test written here, because `env init --target` has to make the identical
 * call: the file a person fills in by hand and the file this command composes
 * on a runner are the same file, and a second opinion about which `example`
 * values are real would make them differ. See that module for what each of its
 * gates is closing, chiefly `DB_URL`, whose example is a genuine
 * `$PROJECT_REF` derivation with `<password>` and `<host>` punched into it.
 */
function fromRegistry(meta: EnvEntry["meta"]): Resolved | null {
  const derivation = derivationOf(meta);
  if (derivation !== null) return { value: derivation, from: "derived" };

  const example = meta.example;
  if (example === undefined || example === "") return null;

  return meta.scope === "default" && meta.secrecy === "public"
    ? { value: example, from: "committed" }
    : null;
}

/**
 * The one expansion failure with a second meaning. For a REQUIRED key it is a
 * fault like any other `DeployError`; for an optional one it is the registry
 * saying "leave it unset until the deploy exists" (STUDY_GROUP_FINDER_URL and
 * its `_CALLBACK`, declared ahead of any web deployment), so the caller skips
 * the key instead. A distinct class rather than a message match, because the
 * write loop's catch must never swallow a cycle or a quoting refusal.
 */
class MissingSourceError extends DeployError {}

/**
 * Expands `$NAME` / `${NAME}` against the values resolved so far.
 *
 * dotenvx would do this at load time and the composed file could carry the
 * formula, but only for an unquoted or double-quoted value, and quoting is what
 * this file cannot compromise on (see `quote` below). So the derivations are
 * resolved here and every line ships fully literal: one mechanism, verifiable
 * by reading the file, with no dependence on which of dotenvx's three quoting
 * modes a value landed in.
 */
function expand(
  key: string,
  value: string,
  resolved: Map<string, Resolved>,
  seen: string[] = [],
): string {
  return value.replace(
    /\$\{([A-Z][A-Z0-9_]*)\}|\$([A-Z][A-Z0-9_]*)/g,
    (_, a, b) => {
      const name = (a ?? b) as string;
      if (seen.includes(name)) {
        throw new DeployError(
          `${key} derives from ${name}, which derives back from it.`,
          [`chain: ${[...seen, name].join(" -> ")}`],
        );
      }
      const target = resolved.get(name);
      if (!target) {
        throw new MissingSourceError(
          `${key} is derived from ${name}, which has no value.`,
          [`${name} is the value to fix; ${key} follows from it.`],
        );
      }
      return expand(name, target.value, resolved, [...seen, name]);
    },
  );
}

/**
 * Single quotes, because dotenvx treats a single-quoted value as fully
 * literal: no `$` expansion, no backslash escapes, and multi-line values (the
 * GitHub App private key) survive verbatim. Verified against dotenvx 2.19 on
 * 2026-08-15, including embedded double quotes, `#`, and a bare `'`.
 *
 * The one shape it cannot express is a value whose first or last character is
 * a quote, since the parser takes everything to the outermost one. That is
 * refused rather than mangled: a credential silently truncated by one
 * character fails at the far end of the pipeline, against a service that will
 * only say "unauthorized".
 */
function quote(key: string, value: string): string {
  if (value.startsWith("'") || value.endsWith("'")) {
    throw new DeployError(
      `${key} begins or ends with a single quote, which cannot be quoted.`,
      ["Re-issue the credential, or wrap it (base64) at both ends."],
    );
  }
  return `'${value}'`;
}

/**
 * Composes the file and writes it.
 *
 * Every refusal is a `DeployError`, and every one of them ALSO lands in the job
 * summary, via the wrapper below. That is deliberate here and not for the other
 * commands in the group: the failure mode this exists to catch is a missing
 * credential, and the person who has to add it is reading the run page rather
 * than a step's log.
 */
export async function runDeployWriteEnv(
  options: WriteEnvOptions = {},
): Promise<WriteEnvResult> {
  const env = options.env ?? process.env;
  try {
    return compose(options, env);
  } catch (err) {
    if (err instanceof DeployError) {
      summary(
        ["### Deploy environment could not be composed", "", err.message, ""],
        env,
      );
      if (err.detail.length > 0) {
        summary(["```", ...err.detail, "```", ""], env);
      }
    }
    throw err;
  }
}

function compose(
  options: WriteEnvOptions,
  env: NodeJS.ProcessEnv,
): WriteEnvResult {
  assertRegistryLoaded();

  const root = options.root ?? PROJECT_ROOT;
  const source = options.source ?? null;

  const environment = resolveEnvironment(env.DEPLOY_ENV);
  if (environment === "development") {
    throw new DeployError(
      "DEPLOY_ENV must name a deployed environment (staging | production).",
      [
        "development means the root .env, which is a real file with real",
        "credentials in it. This command never writes that one.",
      ],
    );
  }

  const ghSecrets = readContext("DEPLOY_GITHUB_SECRETS", env);
  const ghVars = readContext("DEPLOY_GITHUB_VARS", env);

  const smuggled = neverStoreKeys().filter(
    (k) => k in ghSecrets || k in ghVars,
  );
  if (smuggled.length > 0) {
    throw new DeployError(
      `${smuggled.join(", ")} must never be a GitHub secret or variable.`,
      [
        "Delete it from the repository and the environment, then rotate it.",
        "See the declaration in packages/devtools/env.ts for why.",
      ],
    );
  }

  const resolved = new Map<string, Resolved>();
  const missing: string[] = [];
  /** Which keys the write loop may NOT silently drop. See MissingSourceError. */
  const requiredKeys = new Set<string>();

  for (const [key, entries] of variables()) {
    const meta = entries[0]!.meta;

    // One contributor's own value, meaningless anywhere else and required by
    // nothing. An app that could not boot without one could not boot in CI.
    if (meta.scope === "developer") continue;

    // `:tooling` suffixes count as the same manifest. The split says "declared
    // here but not read by the running thing", a distinction about the Worker,
    // not about which step needs the value.
    const owned =
      source === null ||
      entries.some(
        (e) => e.source === source || e.source.startsWith(`${source}:`),
      );
    if (!owned) continue;

    const asSecret = ghSecrets[key];
    const asVariable = ghVars[key];

    // GitHub allows a secret and a variable of the same name in one environment
    // and never says which one it means. Refused: which of the two a deploy used
    // would depend on this file's precedence rules, and nothing at the far end
    // could report which value it got.
    if (asSecret !== undefined && asVariable !== undefined) {
      throw new DeployError(
        `${key} is set BOTH as a secret and as a variable.`,
        [
          "Delete whichever is wrong. A secret is the right home for anything",
          'the registry marks `secrecy: "secret"`; everything else is a variable.',
        ],
      );
    }

    const value =
      asSecret !== undefined
        ? { value: asSecret, from: "secret" as const }
        : asVariable !== undefined
          ? { value: asVariable, from: "variable" as const }
          : fromRegistry(meta);

    // `undefined` is rejected by at least one manifest's schema, so omitting the
    // key breaks that app's boot. Derived rather than listed: the schemas are
    // the same ones the build validates against, so this cannot drift from them.
    // Under `--source`, every secret that manifest declares is required too; see
    // the header for why optional-in-schema is not good enough there.
    const required =
      entries.some((e) => !e.schema.safeParse(undefined).success) ||
      (source !== null && meta.secrecy === "secret");

    if (required) requiredKeys.add(key);

    if (!value) {
      if (required) missing.push(key);
      continue;
    }
    resolved.set(key, value);
  }

  if (missing.length > 0) {
    throw new DeployError(
      `${missing.length} required variable(s) have no value.`,
      [
        ...missing.map((key) => {
          const meta = variables().get(key)![0]!.meta;
          return meta.secrecy === "secret"
            ? `${key}  — a secret: \`pnpm devtools env push\` sends it`
            : `${key}  — not a secret: it belongs in the environment's VARIABLES`;
        }),
        "",
        '`env push` syncs both stores: `secrecy: "secret"` keys to the',
        "environment's secrets, the public per-environment ones (PROJECT_REF,",
        "BASE_URL, PUBLISHABLE_KEY, …) to its variables. A key missing here was",
        "either never in the pusher's .env or never pushed — run",
        "`pnpm devtools env audit --target <target>` to see which.",
      ],
    );
  }

  // ── write ──────────────────────────────────────────────────────────────────

  const file = fileFor(environment);
  const lines = [
    `# ${file} — composed by \`devtools deploy write-env\` for a deploy job.`,
    "#",
    "# NOT a file anybody should have on a laptop. It is written into a runner's",
    "# checkout from the GitHub environment's secrets and variables, read once by",
    "# with-env, and discarded with the runner. Every value is single-quoted and",
    "# literal: the $VAR derivations were already expanded when this was written.",
    "",
  ];

  const provenance = new Map<string, Provenance>();

  for (const [key, entry] of resolved) {
    let value: string;
    if (entry.from === "derived") {
      try {
        value = expand(key, entry.value, resolved);
      } catch (error) {
        // An optional derivation whose source has no value is a key the
        // registry declared ahead of its deployment, not a fault: omit it,
        // exactly as a hand-filled .env leaves it commented out. A required
        // key keeps the loud failure, naming the source to fix.
        if (error instanceof MissingSourceError && !requiredKeys.has(key)) {
          continue;
        }
        throw error;
      }
    } else {
      value = entry.value;
    }
    lines.push(`${key}=${quote(key, value)}`);
    provenance.set(key, entry.from);
  }

  try {
    writeFileSync(join(root, file), `${lines.join("\n")}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (cause) {
    // `wx` is the refusal, so EEXIST is the expected shape of "you ran this on
    // a machine that already has the file" rather than an unexplained crash.
    // On a runner it cannot happen; on a laptop the file it declined to touch
    // holds the live credentials for that environment.
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
      throw new DeployError(
        `${file} already exists, and this never overwrites one.`,
        [
          "It composes a throwaway file for a runner from the GitHub",
          "environment's secrets and variables. An existing copy is somebody's",
          "real one — `pnpm devtools env pull --target <target>` updates that",
          "in place instead.",
        ],
      );
    }
    throw cause;
  }

  return { file, provenance };
}

/**
 * The line the job log gets: names and provenance only.
 *
 * Never a value, and never a fingerprint either. A fingerprint helps when
 * comparing two stores by hand, and there is nothing here to compare against.
 */
export function renderWriteEnvReport(result: WriteEnvResult): string[] {
  const counts: Record<Provenance, number> = {
    secret: 0,
    variable: 0,
    derived: 0,
    committed: 0,
  };
  for (const from of result.provenance.values()) counts[from] += 1;

  return [
    `devtools deploy write-env: wrote ${result.file} — ` +
      `${result.provenance.size} variables (${counts.secret} secret, ` +
      `${counts.variable} variable, ${counts.derived} derived, ` +
      `${counts.committed} committed)`,
    ...[...result.provenance].map(
      ([key, from]) => `  ${from.padEnd(9)} ${key}`,
    ),
  ];
}
