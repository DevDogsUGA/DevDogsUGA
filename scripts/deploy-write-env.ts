/**
 * Materialises `.env.staging` / `.env.production` inside a deploy job.
 *
 * Everything downstream of this script — `cf:build:*`, `cf:deploy:*`,
 * `deploy:*`, `scripts/mint-sandbox-token.mjs` — reads its configuration
 * through `with-env`, which reads a file on disk. CI has no such file, so one
 * step has to write it. This is that step, and it is the ONLY place in the
 * pipeline that touches the `secrets` and `vars` contexts: after it runs, a
 * deploy job looks exactly like a devops laptop, and every later step can be
 * the same command a person would run by hand.
 *
 * ## Where the values come from, and why there are four answers
 *
 *   secret     `${{ secrets.* }}` for the environment — written by a human
 *              running `pnpm devtools secrets push`. CI never reads Bitwarden.
 *   variable   `${{ vars.* }}` — the per-environment values that are NOT
 *              secrets (`PROJECT_REF`, `BASE_URL`, `PUBLISHABLE_KEY`, …).
 *   derived    an `example` metadata entry that is a `$VAR` formula rather than
 *              a placeholder: `API_URL` is `https://$PROJECT_REF.supabase.co`
 *              and always has been. Security plan §A.4 — "derived at deploy
 *              time from PROJECT_REF, never stored".
 *   committed  a `scope: "default"` value, identical in every environment and
 *              carried in the registry (`GITHUB_ORG`, the avatars bucket).
 *
 * ⚠️ A literal `example` on a `scope: "environment"` key is NOT a fallback.
 * `BASE_URL`'s example is `http://localhost:3000` and `GITHUB_APP_ID`'s is
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
 * failure is not a wrong value, it is a missing one — and GitHub hands a
 * missing secret to a workflow as an EMPTY STRING rather than an error
 * (§A.7's closing warning).
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
 * mostly unreachable — `secrets push` will not upload one — but this is the
 * last place to catch a `BWS_ACCESS_TOKEN` added to the repository by hand,
 * and the cost of missing it is every secret the project holds (see the long
 * comment on the declaration in `packages/devtools/env.ts`).
 *
 * Writing uses `{ flag: "wx" }`, the same atomic refusal `secrets init` uses.
 * On a runner the file never exists; on a laptop it is the devops copy of the
 * production credentials, and a stray run of this script must not be able to
 * overwrite it. `development` is refused outright for the same reason: `.env`
 * is that file.
 *
 * ## `--source <manifest>`
 *
 * Composes only what one manifest declares, and demands ALL of its secrets
 * rather than only its schema-required keys. That is for a step that exists to
 * mutate one thing — `supabase config push` reads `supabase/env.ts` and
 * nothing else — where the job runs in a GitHub environment holding a
 * deliberately narrow slice of the credentials and the interesting failure is
 * an OAuth provider quietly reconfigured without its secret. Every one of
 * those keys is `.optional()` in the schema (an app boots fine without them;
 * only `config.toml` reads them), so schema-required alone would let the
 * push through with a provider half-configured.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  envFileFor,
  neverStoreKeys,
  resolveEnvironment,
  variables,
  type EnvEntry,
} from "@devdogsuga/env";
import { loadRegistry } from "../packages/devtools/src/env/discovery.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Where a value came from, for the provenance table. */
type Provenance = "secret" | "variable" | "derived" | "committed";

interface Resolved {
  value: string;
  from: Provenance;
}

function fail(message: string, detail: string[] = []): never {
  console.error(`deploy-write-env: ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  summary([`### Deploy environment could not be composed`, "", message, ""]);
  if (detail.length > 0) summary(["```", ...detail, "```", ""]);
  process.exit(1);
}

/** Appends to the job summary when running under Actions; a no-op elsewhere. */
function summary(lines: string[]): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  writeFileSync(path, `${lines.join("\n")}\n`, { flag: "a" });
}

/**
 * `${{ toJSON(secrets) }}` and `${{ toJSON(vars) }}` arrive as JSON objects.
 *
 * Non-string members are dropped rather than coerced: the contexts only ever
 * hold strings, and a `String(value)` here would turn a future shape change
 * into a value like `[object Object]` written to a Worker.
 */
function readContext(name: string): Record<string, string> {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    fail(`${name} is not valid JSON.`, [String(cause)]);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail(`${name} is not a JSON object.`);
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
 * `secrecy: "public"` is the gate, and it is doing real work rather than being
 * a tidy precondition: `DB_URL`'s example is
 * `postgresql://postgres.$PROJECT_REF:<password>@<host>:5432/postgres`, which
 * contains a `$` and would otherwise read as a derivation. A secret's example
 * is never a value; it is a shape.
 */
function fromRegistry(meta: EnvEntry["meta"]): Resolved | null {
  if (meta.secrecy !== "public") return null;

  const example = meta.example;
  if (example === undefined || example === "") return null;

  if (example.includes("$")) return { value: example, from: "derived" };
  return meta.scope === "default"
    ? { value: example, from: "committed" }
    : null;
}

/**
 * Expands `$NAME` / `${NAME}` against the values resolved so far.
 *
 * dotenvx would do this at load time and the composed file could simply carry
 * the formula — but only for an unquoted or double-quoted value, and quoting
 * is exactly what this file cannot compromise on (see `quote` below). So the
 * derivations are resolved here and every line ships fully literal: one
 * mechanism, verifiable by reading the file, with no dependence on which of
 * dotenvx's three quoting modes a value happened to land in.
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
        fail(`${key} derives from ${name}, which derives back from it.`, [
          `chain: ${[...seen, name].join(" -> ")}`,
        ]);
      }
      const target = resolved.get(name);
      if (!target) {
        fail(`${key} is derived from ${name}, which has no value.`, [
          `${name} is the value to fix; ${key} follows from it.`,
        ]);
      }
      return expand(name, target.value, resolved, [...seen, name]);
    },
  );
}

/**
 * Single quotes, because dotenvx treats a single-quoted value as fully
 * literal — no `$` expansion, no backslash escapes, and multi-line values (the
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
    fail(`${key} begins or ends with a single quote, which cannot be quoted.`, [
      "Re-issue the credential, or wrap it (base64) at both ends.",
    ]);
  }
  return `'${value}'`;
}

// ── compose ──────────────────────────────────────────────────────────────────

const environment = resolveEnvironment(process.env.DEPLOY_ENV);
if (environment === "development") {
  fail("DEPLOY_ENV must name a deployed environment (staging | production).", [
    "development means the root .env, which is a real file with real",
    "credentials in it. This script never writes that one.",
  ]);
}

const sourceIndex = process.argv.indexOf("--source");
const source = sourceIndex === -1 ? null : process.argv[sourceIndex + 1];
if (sourceIndex !== -1 && (!source || source.startsWith("--"))) {
  fail("--source needs a manifest name, e.g. --source supabase.");
}

await loadRegistry();

const ghSecrets = readContext("DEPLOY_GITHUB_SECRETS");
const ghVars = readContext("DEPLOY_GITHUB_VARS");

const smuggled = neverStoreKeys().filter((k) => k in ghSecrets || k in ghVars);
if (smuggled.length > 0) {
  fail(`${smuggled.join(", ")} must never be a GitHub secret or variable.`, [
    "Delete it from the repository and the environment, then rotate it.",
    "See the declaration in packages/devtools/env.ts for why.",
  ]);
}

const resolved = new Map<string, Resolved>();
const missing: string[] = [];

for (const [key, entries] of variables()) {
  const meta = entries[0]!.meta;

  // One contributor's own value, meaningless anywhere else and required by
  // nothing — an app that could not boot without one could not boot in CI.
  if (meta.scope === "developer") continue;

  // `:tooling` suffixes count as the same manifest — the split says "declared
  // here but not read by the running thing", which is a distinction about the
  // Worker, not about which step needs the value.
  const owned =
    source === null ||
    entries.some(
      (e) => e.source === source || e.source.startsWith(`${source}:`),
    );
  if (!owned) continue;

  const asSecret = ghSecrets[key];
  const asVariable = ghVars[key];

  // GitHub allows a secret and a variable of the same name in one environment,
  // and resolves the ambiguity by never telling you. Refused: which of the two
  // a deploy used would depend on this file's precedence rules, and nothing at
  // the far end could report which value it got.
  if (asSecret !== undefined && asVariable !== undefined) {
    fail(`${key} is set BOTH as a secret and as a variable.`, [
      "Delete whichever is wrong. A secret is the right home for anything",
      'the registry marks `secrecy: "secret"`; everything else is a variable.',
    ]);
  }

  const value =
    asSecret !== undefined
      ? { value: asSecret, from: "secret" as const }
      : asVariable !== undefined
        ? { value: asVariable, from: "variable" as const }
        : fromRegistry(meta);

  // `undefined` is rejected by at least one manifest's schema, so omitting the
  // key breaks that app's boot. Derived rather than listed — the schemas are
  // the same ones the build validates against, so this cannot drift from them.
  // Under `--source`, every secret that manifest declares is required too; see
  // the header for why optional-in-schema is not good enough there.
  const required =
    entries.some((e) => !e.schema.safeParse(undefined).success) ||
    (source !== null && meta.secrecy === "secret");

  if (!value) {
    if (required) missing.push(key);
    continue;
  }
  resolved.set(key, value);
}

if (missing.length > 0) {
  fail(`${missing.length} required variable(s) have no value.`, [
    ...missing.map((key) => {
      const meta = variables().get(key)![0]!.meta;
      return meta.secrecy === "secret"
        ? `${key}  — a secret: \`pnpm devtools secrets push\` sends it`
        : `${key}  — not a secret: it belongs in the environment's VARIABLES`;
    }),
    "",
    '`secrets push` syncs both stores: `secrecy: "secret"` keys to the',
    "environment's secrets, the public per-environment ones (PROJECT_REF,",
    "BASE_URL, PUBLISHABLE_KEY, …) to its variables. A key missing here was",
    "either never in the pusher's .env or never pushed — run",
    "`pnpm devtools secrets audit --env <env>` to see which.",
  ]);
}

// ── write ────────────────────────────────────────────────────────────────────

const file = envFileFor(environment);
const lines = [
  `# ${file} — composed by scripts/deploy-write-env.ts for a deploy job.`,
  "#",
  "# NOT a file anybody should have on a laptop. It is written into a runner's",
  "# checkout from the GitHub environment's secrets and variables, read once by",
  "# with-env, and discarded with the runner. Every value is single-quoted and",
  "# literal: the $VAR derivations were already expanded when this was written.",
  "",
];

const counts: Record<Provenance, number> = {
  secret: 0,
  variable: 0,
  derived: 0,
  committed: 0,
};

for (const [key, entry] of resolved) {
  const value =
    entry.from === "derived" ? expand(key, entry.value, resolved) : entry.value;
  lines.push(`${key}=${quote(key, value)}`);
  counts[entry.from] += 1;
}

writeFileSync(join(ROOT, file), `${lines.join("\n")}\n`, {
  flag: "wx",
  mode: 0o600,
});

// Names and provenance only — never a value, and never a fingerprint either:
// a fingerprint is useful for comparing two stores by hand, and there is
// nothing here to compare it against.
console.error(
  `deploy-write-env: wrote ${file} — ${resolved.size} variables ` +
    `(${counts.secret} secret, ${counts.variable} variable, ` +
    `${counts.derived} derived, ${counts.committed} committed)`,
);
for (const [key, entry] of resolved)
  console.error(`  ${entry.from.padEnd(9)} ${key}`);
