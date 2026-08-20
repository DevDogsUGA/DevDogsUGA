/**
 * `devtools deploy secrets-file --app <app> [--mint]`
 *
 * Composes the `--secrets-file` a `wrangler deploy` uploads with one Worker.
 *
 * Runs INSIDE `with-env`, so `process.env` is the environment
 * `devtools deploy write-env` composed a few steps earlier — i.e. the ordinary
 * `pnpm devtools deploy secrets-file …`, unlike `write-env`, which is the one
 * command in this group that has to bypass the wrapper. It reads no GitHub
 * context of its own: one place in the pipeline touches `secrets` and `vars`,
 * and this is not it.
 *
 * ## ⚠️ stdout is a credential channel here
 *
 * The only thing this command writes to stdout is `::add-mask::<token>`, and
 * that line has to reach GitHub unaccompanied on a line of its own. Everything
 * else — the omission notice, the key list, the failures — goes to stderr
 * through `say()`. `cli.ts` prints no `intro()` banner for the `deploy` group
 * for the same reason; see `report.ts` for the measurement.
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
 *     `SUPABASE_JWT_SIGNING_KEY` the same way, since only the mint command
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
 * `devtools deploy orphans` reports whatever the Worker is still holding that
 * nothing declares any more.
 *
 * ## The minted credential
 *
 * `SANDBOX_PROXY_TOKEN` is signed at deploy time and has no stored copy
 * anywhere, so it cannot arrive through the env file. `--mint` calls the
 * sibling `deploy mint-token` command IN PROCESS, takes the token it would
 * have printed, and masks it in the log — GitHub only masks secrets it issued,
 * and a freshly signed JWT is not one of them. In process rather than as a
 * subprocess, which is what the predecessor script did: a stdout channel whose
 * content is a production credential can be corrupted by any `console.log`
 * anywhere in the minter's import graph, and there is no reason to keep that
 * channel between two commands in the same binary.
 *
 * `--mint` is a BARE FLAG. It used to take the path of a script to run, which
 * meant a workflow edit could point the composer at any executable on the
 * runner and have its stdout written into a Worker secret. There is one minting
 * command in this repository and it is a sibling of this one, so naming it is
 * not a decision a caller gets to make.
 *
 * Which variable the token fills is derived, not passed in either: a
 * `secrecy: "secret"` key the app declares that `storableKeys()` excludes is
 * by definition one with no stored value, which is what "minted" means.
 * Exactly one is expected, and anything else is a hard failure.
 *
 * ## Interface
 *
 *   DEPLOY_ENV=production pnpm devtools deploy secrets-file --app sandbox --mint
 *
 * Writes `dir=` and `file=` to `$GITHUB_OUTPUT`. The caller removes `dir` in an
 * `if: always()` step — the runner is ephemeral, so this matters on a
 * self-hosted one and costs nothing on a hosted one.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storableKeys, variables, type EnvEntry } from "@devdogsuga/env";
import { assertRegistryLoaded } from "../env/discovery.js";
import { runMintToken } from "./mint-token.js";
import { DeployError, say, summary } from "./report.js";

export interface SecretsFileOptions {
  /** `--app`: the workspace app whose manifest names the Worker's secrets. */
  app: string;
  /** `--mint`: sign the app's minted credential and include it. */
  mint: boolean;
  /** Defaults to the ambient environment; a parameter so tests need not mutate it. */
  env?: NodeJS.ProcessEnv;
  /**
   * Mints the deploy-time credential, returning it on its own.
   *
   * Injectable so the tests can exercise the masking, the ordering and the
   * one-minted-key rule without signing anything.
   */
  mintToken?: () => string;
}

export interface SecretsFileResult {
  /** The 0700 directory holding the file; the caller removes it. */
  dir: string;
  /** The 0600 file itself. */
  file: string;
  /** Names sent, in registry order. Never values. */
  keys: string[];
  /** Declared, optional, and absent from the environment — reported, not fatal. */
  omitted: string[];
}

/**
 * The ONE line this command puts on stdout.
 *
 * `process.stdout.write` rather than `console.log` so that grepping this
 * directory for a stdout write finds exactly this call and nothing incidental.
 * A workflow command is recognised per line, so the newline is part of it.
 */
function mask(token: string): void {
  process.stdout.write(`::add-mask::${token}\n`);
}

/**
 * Mints the token IN PROCESS, capturing what the command would have printed.
 *
 * The predecessor of this file spawned `node scripts/mint-sandbox-token.mjs`
 * and took its stdout. That boundary is gone, and deliberately: it existed
 * only because the minter was a separate file, and every hazard on it was a
 * consequence of the channel rather than of the work. A subprocess whose
 * stdout IS a production credential can be corrupted by any `console.log`
 * anywhere in its import graph, and `deploy/mint-token.ts` says at length that
 * an in-process caller should not take that risk.
 *
 * `runMintToken` rather than `mintSandboxToken` directly, because the command
 * carries a guard the bare signer does not: it refuses a `DEPLOY_ENV` that is
 * not a deployed environment, and an unset one would sign a production
 * credential with the development key. Its sink is injectable for exactly this
 * — the token is collected here and never reaches a real stream.
 */
function mintInProcess(env: NodeJS.ProcessEnv): string {
  let captured = "";
  runMintToken(env, {
    write: (chunk: string) => {
      captured += chunk;
    },
  });
  return captured.trim();
}

/**
 * Declared by this app, for this app's Worker.
 *
 * `source` is the manifest that declared it, and a `:` suffix is the repo's
 * existing convention for "declared here, but not part of the running thing"
 * — see `sectionOf()` in devtools' `env/example.ts`, which folds the two
 * together for display and keeps them distinct everywhere else.
 */
function declaredBy(entries: EnvEntry[], app: string): boolean {
  return entries.some((e) => e.source === app && !e.client);
}

export async function runDeploySecretsFile(
  options: SecretsFileOptions,
): Promise<SecretsFileResult> {
  assertRegistryLoaded();

  const { app, mint } = options;
  const env = options.env ?? process.env;
  const mintToken = options.mintToken ?? (() => mintInProcess(env));

  const storable = new Set(storableKeys());
  const send = new Map<string, string>();
  const absent: string[] = [];
  const minted: string[] = [];

  for (const [key, entries] of variables()) {
    if (!declaredBy(entries, app)) continue;
    const meta = entries[0]!.meta;

    // Public server keys ship alongside the secrets, because nothing else
    // reaches the Worker's runtime: OpenNext copies the Worker env into
    // process.env per request, and a value that was only in the composed
    // .env file at build time is gone by then. The first staging deploy
    // proved it — the schedule-builder Worker booted without API_URL,
    // REST_URL, PUBLISHABLE_KEY, STORAGE_S3_URL or S3_PROTOCOL_REGION and
    // answered 500 on every route. Client (NEXT_PUBLIC) keys are excluded
    // by `declaredBy` (inlined at build); never-store keys stay excluded —
    // a Worker secret is a remote copy, which is the thing they forbid.
    if (meta.secrecy === "secret") {
      if (!storable.has(key)) {
        minted.push(key);
        continue;
      }
    } else if (meta.secrecy !== "public") {
      continue;
    }

    const value = env[key];
    if (value === undefined || value === "") {
      absent.push(key);
      continue;
    }
    send.set(key, value);
  }

  // Absent is reported, not fatal. `deploy write-env` already failed the job
  // for anything an app's schema requires, so what reaches here is optional by
  // declaration — `OAUTH_CLIENT_SECRET` on a deployment that uses the built-in
  // provider, say. Sending an empty string instead would be worse than omitting
  // it: every consumer that checks for presence would read it as configured.
  if (absent.length > 0) {
    say([
      `devtools deploy secrets-file: ${absent.length} optional key(s) have ` +
        `no value and are omitted: ${absent.join(", ")}`,
    ]);
  }

  if (mint) {
    if (minted.length !== 1) {
      throw new DeployError(
        `--mint expects exactly one minted key declared by ${app}, found ` +
          `${minted.length}${minted.length > 0 ? `: ${minted.join(", ")}` : ""}.`,
        [
          'A minted key is one the registry marks `secrecy: "secret"` and',
          "`storableKeys()` excludes, i.e. a secret with no stored copy.",
          "Declare it in the app's env.ts with `minted: true`.",
        ],
      );
    }

    let token: string;
    try {
      token = mintToken();
    } catch (cause) {
      // A `MintError` is a `DeployError` and already names the thing to fix —
      // an unset DEPLOY_ENV, a signing key of the wrong length. Re-wrapping it
      // would bury the only message worth reading.
      if (cause instanceof DeployError) throw cause;
      throw new DeployError(
        `Minting ${minted[0]!} failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }

    if (token === "") {
      throw new DeployError(`Minting ${minted[0]!} produced an empty token.`);
    }

    // GitHub masks the secrets IT issued. This one was signed thirty seconds
    // ago, so nothing knows to redact it until we say so. Before it is written
    // anywhere, so no later failure can print it unmasked.
    mask(token);
    send.set(minted[0]!, token);
  } else if (minted.length > 0) {
    throw new DeployError(
      `${app} declares minted secret(s) with nothing to mint them: ${minted.join(", ")}.`,
      [
        "Pass --mint, or the Worker deploys without them and keeps whatever",
        "the previous deploy left — --secrets-file preserves omissions.",
      ],
    );
  }

  if (send.size === 0) {
    throw new DeployError(`${app} has no Worker secrets to send.`, [
      "That is almost certainly wrong: a --secrets-file with nothing in it",
      "would leave every previously set secret in place, unexamined.",
    ]);
  }

  // mkdtemp gives 0700 on every platform Node supports; the mode is repeated
  // anyway so the intent survives a reader who does not know that. RUNNER_TEMP
  // is cleared between jobs on a hosted runner and is the documented place for
  // this on a self-hosted one.
  const dir = mkdtempSync(join(env.RUNNER_TEMP ?? tmpdir(), "deploy-secrets-"));
  const file = join(dir, `${app}.json`);
  writeFileSync(
    file,
    `${JSON.stringify(Object.fromEntries(send), null, 2)}\n`,
    { mode: 0o600 },
  );

  const out = env.GITHUB_OUTPUT;
  if (out) writeFileSync(out, `dir=${dir}\nfile=${file}\n`, { flag: "a" });

  const keys = [...send.keys()];

  say([
    `devtools deploy secrets-file: ${send.size} secret(s) for ${app} -> ${file}`,
    ...keys.map((k) => `  ${k}`),
  ]);

  // Names to the job summary as well as the log, and the reason is that this
  // list IS the Worker's credential surface. Reading it should not require
  // expanding a step: "why does the sandbox proxy hold that?" is exactly the
  // question a per-deploy record makes answerable, and the answer lives in the
  // app's manifest rather than anywhere in this pipeline.
  summary(
    [
      `### Worker secrets sent to \`${app}\``,
      "",
      ...keys.map((key) => `* \`${key}\``),
      "",
      "Names only. The complete set is sent every deploy, because",
      "`--secrets-file` preserves what it omits.",
      "",
      "",
    ],
    env,
  );

  return { dir, file, keys, omitted: absent };
}
