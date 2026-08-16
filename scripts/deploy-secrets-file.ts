/**
 * Composes the `--secrets-file` a `wrangler deploy` uploads with one Worker.
 *
 * Runs INSIDE `with-env`, so `process.env` is the environment
 * `scripts/deploy-write-env.ts` composed a few steps earlier. It reads no
 * GitHub context of its own — one place in the pipeline touches `secrets` and
 * `vars`, and this is not it.
 *
 * ## Which keys, and why they are derived rather than listed
 *
 * `storableKeys()` intersected with the keys the app's own manifest declares.
 * A hand-written list per Worker is the exact failure the registry was built
 * to remove: a variable added to `src/env.ts` and forgotten in the list is
 * simply absent from the deployed environment, and the first thing that reads
 * it fails at run time in production.
 *
 * Two exclusions fall out of the same rule rather than being special cases:
 *
 *   * `:tooling` sources. `study-group-finder:tooling` declares `SECRET_KEY`
 *     for supadart, which runs on a laptop; `sandbox` should declare
 *     `SUPABASE_JWT_SIGNING_KEY` the same way, since only the mint script
 *     reads it. A key the deploy needs is not automatically a key the WORKER
 *     needs, and sending one anyway hands an internet-facing proxy a
 *     credential it never asks for.
 *   * `client: true` declarations. Those are inlined into the browser bundle
 *     at build time and are not Worker secrets at all (§A.6.3).
 *
 * ## ⚠️ Always the complete set
 *
 * `wrangler deploy --secrets-file` applies ADDITIVELY: it preserves every
 * secret it does not mention, which may be one another environment set. A
 * partial file therefore inherits stale values silently rather than failing —
 * so this sends everything the app declares, every time, and
 * `scripts/deploy-orphan-audit.ts` reports whatever the Worker is still
 * holding that nothing declares any more.
 *
 * ## The minted credential
 *
 * `SANDBOX_PROXY_TOKEN` is signed at deploy time and has no stored copy
 * anywhere, so it cannot arrive through the env file. `--mint <script>` runs
 * one, takes its stdout as the value, and masks it in the log — GitHub only
 * masks secrets it issued, and a freshly signed JWT is not one of them.
 *
 * Which variable it fills is derived, not passed in: a `secrecy: "secret"` key
 * the app declares that `storableKeys()` excludes is by definition one with no
 * stored value, which is what "minted" means. Exactly one is expected, and
 * anything else is a hard failure — naming the key on the command line would
 * let this script write a token under whatever name a workflow edit gave it.
 *
 * ## Interface
 *
 *   DEPLOY_ENV=production pnpm exec with-env \
 *     tsx scripts/deploy-secrets-file.ts --app sandbox \
 *       --mint scripts/mint-sandbox-token.mjs
 *
 * Writes `dir=` and `file=` to `$GITHUB_OUTPUT`. The caller removes `dir` in an
 * `if: always()` step — the runner is ephemeral, so this matters on a
 * self-hosted one and costs nothing on a hosted one.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { storableKeys, variables, type EnvEntry } from "@devdogsuga/env";
import { loadRegistry } from "../packages/devtools/src/env/discovery.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message: string, detail: string[] = []): never {
  console.error(`deploy-secrets-file: ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  process.exit(1);
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} needs a value.`);
  return value;
}

const app = flag("--app") ?? fail("--app <name> is required.");
const mint = flag("--mint");

await loadRegistry();

/**
 * Declared by this app, for this app's Worker.
 *
 * `source` is the manifest that declared it, and a `:` suffix is the repo's
 * existing convention for "declared here, but not part of the running thing"
 * — see `sectionOf()` in devtools' `env/example.ts`, which folds the two
 * together for display and keeps them distinct everywhere else.
 */
function declaredBy(entries: EnvEntry[]): boolean {
  return entries.some((e) => e.source === app && !e.client);
}

const storable = new Set(storableKeys());
const send = new Map<string, string>();
const absent: string[] = [];
const minted: string[] = [];

for (const [key, entries] of variables()) {
  if (!declaredBy(entries)) continue;
  if (entries[0]!.meta.secrecy !== "secret") continue;

  if (!storable.has(key)) {
    minted.push(key);
    continue;
  }

  const value = process.env[key];
  if (value === undefined || value === "") {
    absent.push(key);
    continue;
  }
  send.set(key, value);
}

// Absent is reported, not fatal. `deploy-write-env.ts` already failed the job
// for anything an app's schema requires, so what reaches here is optional by
// declaration — `OAUTH_CLIENT_SECRET` on a deployment that uses the built-in
// provider, say. Sending an empty string instead would be worse than omitting
// it: every consumer that checks for presence would read it as configured.
if (absent.length > 0) {
  console.error(
    `deploy-secrets-file: ${absent.length} optional secret(s) have no value ` +
      `and are omitted: ${absent.join(", ")}`,
  );
}

if (mint) {
  if (minted.length !== 1) {
    fail(
      `--mint expects exactly one minted key declared by ${app}, found ` +
        `${minted.length}${minted.length > 0 ? `: ${minted.join(", ")}` : ""}.`,
      [
        'A minted key is one the registry marks `secrecy: "secret"` and',
        "`storableKeys()` excludes, i.e. a secret with no stored copy.",
        "Declare it in the app's env.ts with `minted: true`.",
      ],
    );
  }

  // stdout is the token and nothing else, by that script's own contract; a
  // non-zero exit throws here with its stderr already on the job log.
  let token: string;
  try {
    token = execFileSync(process.execPath, [resolve(ROOT, mint)], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }).trim();
  } catch {
    fail(`${mint} could not mint a token. Its own message is above.`);
  }

  if (token === "") fail(`${mint} exited 0 but printed nothing.`);

  // GitHub masks the secrets IT issued. This one was signed thirty seconds
  // ago, so nothing knows to redact it until we say so.
  console.log(`::add-mask::${token}`);
  send.set(minted[0]!, token);
} else if (minted.length > 0) {
  fail(
    `${app} declares minted secret(s) with nothing to mint them: ${minted.join(", ")}.`,
    [
      "Pass --mint <script>, or the Worker deploys without them and keeps",
      "whatever the previous deploy left — --secrets-file preserves omissions.",
    ],
  );
}

if (send.size === 0) {
  fail(`${app} has no Worker secrets to send.`, [
    "That is almost certainly wrong: a --secrets-file with nothing in it",
    "would leave every previously set secret in place, unexamined.",
  ]);
}

// mkdtemp gives 0700 on every platform Node supports; the mode is repeated
// anyway so the intent survives a reader who does not know that. RUNNER_TEMP
// is cleared between jobs on a hosted runner and is the documented place for
// this on a self-hosted one.
const dir = mkdtempSync(
  join(process.env.RUNNER_TEMP ?? tmpdir(), "deploy-secrets-"),
);
const file = join(dir, `${app}.json`);
writeFileSync(file, `${JSON.stringify(Object.fromEntries(send), null, 2)}\n`, {
  mode: 0o600,
});

const out = process.env.GITHUB_OUTPUT;
if (out) writeFileSync(out, `dir=${dir}\nfile=${file}\n`, { flag: "a" });

console.error(
  `deploy-secrets-file: ${send.size} secret(s) for ${app} -> ${file}\n` +
    [...send.keys()].map((k) => `  ${k}`).join("\n"),
);

// Names to the job summary as well as the log, and the reason is that this
// list IS the Worker's credential surface. Reading it should not require
// expanding a step: "why does the sandbox proxy hold that?" is exactly the
// question a per-deploy record makes answerable, and the answer lives in the
// app's manifest rather than anywhere in this pipeline.
const stepSummary = process.env.GITHUB_STEP_SUMMARY;
if (stepSummary) {
  writeFileSync(
    stepSummary,
    [
      `### Worker secrets sent to \`${app}\``,
      "",
      ...[...send.keys()].map((key) => `* \`${key}\``),
      "",
      "Names only. The complete set is sent every deploy, because",
      "`--secrets-file` preserves what it omits.",
      "",
      "",
    ].join("\n"),
    { flag: "a" },
  );
}
