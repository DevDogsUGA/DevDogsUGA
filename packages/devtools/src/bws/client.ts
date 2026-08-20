/**
 * Secrets Manager, through the official SDK — no `bws` binary to install.
 *
 * This wrapped the `bws` CLI until 2026-08-19. The CLI was the right call
 * against the raw REST API — Secrets Manager is end-to-end encrypted, the
 * server stores ciphertext, and the key that opens it is derived from the
 * access token by the client, so `fetch` returns blobs and reimplementing the
 * crypto is not a trade worth making. `@bitwarden/sdk-napi` is that same
 * client-side crypto (the same Rust core the CLI wraps), loaded in-process,
 * which buys two things the CLI could not:
 *
 *   * **Nothing to install.** The SDK is a dependency of this package, so
 *     `pnpm install` is the whole setup — no more "install bws from the
 *     releases page" step, and no version somebody's laptop drifted on.
 *   * **No credential in argv.** `bws secret create` took the VALUE as a
 *     positional argument, visible to `ps` for the length of the call — a
 *     documented property of the tool this wrapper could only apologize for.
 *     In-process values never touch a process table.
 *
 * ⚠️ Imported LAZILY, at the first real call. The SDK is a native module, and
 * loading it at import time would tax every `cli:no-env` path — including the
 * CI guards — with a `.node` binary none of them use.
 *
 * The one thing the SDK needs that the CLI did not: the ORGANIZATION ID. The
 * CLI derived it from the access token's login response; the SDK's every list
 * and create takes it as an argument, and nothing in its surface discovers it.
 * It is a public identifier (a UUID that confers nothing), read from
 * `BWS_ORG_ID` — see the declaration in `packages/devtools/env.ts`.
 */
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { log, select, text } from "@clack/prompts";
import { NoAccessTokenError, promptForToken, resolveToken } from "./token.js";
import { withRateLimitRetry } from "./retry.js";
import { saveToDevEnv } from "./store.js";
import {
  readTokenFromVault,
  saveTokenToVault,
  VAULT_ITEM_NAME,
} from "./vault.js";
import { unwrap } from "../ui.js";

export class BwsError extends Error {}

export interface BwsSecret {
  id: string;
  key: string;
  value: string;
  note: string;
  projectId: string;
  /**
   * ISO 8601, when this secret last changed.
   *
   * Optional because it is not needed to push or pull — but it is the whole
   * basis of the staleness half of `env audit`, which cannot compare values
   * (GitHub secrets are write-only) and instead asks whether GitHub was updated
   * after this.
   */
  revisionDate?: string;
}

let explicitToken: string | undefined;
let resolved: Promise<string> | undefined;
/** Where a just-typed token goes, picked in `offerSave`, used in `save`. */
let saveDestination: "env" | "vault" | "no" = "no";

/** Records `--access-token`, before any command runs. */
export function setExplicitAccessToken(token: string | undefined): void {
  explicitToken = token;
  resolved = undefined;
}

/**
 * The access token, found once per process.
 *
 * Memoized as a **promise**, not a value: resolution can prompt, and a single
 * command makes several Secrets Manager calls. Caching the value alone would
 * still let two concurrent calls open two prompts over each other.
 *
 * Whatever the source, the token reaches the SDK as a function argument in
 * this process — never argv, never a child's environment.
 */
export async function accessToken(): Promise<string> {
  resolved ??= resolveToken({
    explicit: explicitToken,
    env: process.env.BWS_ACCESS_TOKEN,
    fromVault: readTokenFromVault,
    prompt: promptForToken,
    // The destination is picked when the save is offered, and the pick is
    // carried into `save` by closure — the two callbacks are halves of one
    // exchange. `.env` first: it is this repository's own file, `with-env`
    // already loads it, and `env push` refuses the key by name, so the only
    // machine that can read the saved copy is this one.
    offerSave: async () => {
      saveDestination = unwrap(
        await select({
          message: "Save it, so this is the last time you paste it?",
          options: [
            {
              value: "env" as const,
              label: "yes — into .env",
              hint: "gitignored, this machine only; push refuses it by name",
            },
            {
              value: "vault" as const,
              label: "yes — into my Bitwarden vault",
              hint: "needs `pnpm bw login`; follows you across machines",
            },
            { value: "no" as const, label: "no — ask me again next time" },
          ],
          initialValue: "env" as const,
        }),
      );
      return saveDestination !== "no";
    },
    save: async (token) => {
      if (saveDestination === "env") {
        await saveToDevEnv("BWS_ACCESS_TOKEN", token);
        log.success("Stored in .env — with-env loads it on every run.");
        return;
      }
      const saved = await saveTokenToVault(token);
      if (saved) {
        log.success(`Stored as "${VAULT_ITEM_NAME}" in your Bitwarden vault.`);
      } else {
        log.warn(
          "Could not save it. The command will continue with the token you " +
            "typed; nothing was written to your vault.",
        );
      }
    },
    onSource: (source) => {
      if (source === "flag") {
        log.warn(
          "--access-token puts a live credential in argv, where `ps` can read " +
            "it for the length of the call, and in your shell history. Prefer " +
            "BWS_ACCESS_TOKEN or the vault.",
        );
      }
    },
  }).catch((err: unknown) => {
    resolved = undefined; // so a later call can ask again
    throw err instanceof NoAccessTokenError ? new BwsError(err.message) : err;
  });

  return resolved;
}

let resolvedOrgId: Promise<string> | undefined;

/**
 * The organization the machine account belongs to: the environment, else a
 * prompt with an offer to save.
 *
 * Prompted rather than only refused because it is the one Secrets Manager
 * input with nothing secret about it — a public UUID that identifies and
 * does not authorize — so asking costs nothing and saves a docs round-trip.
 * Where nobody can answer (a pipe), the named refusal below is the answer:
 * an SDK error about a malformed UUID would send somebody debugging the
 * token, which is the one thing that is fine.
 */
function organizationId(): Promise<string> {
  resolvedOrgId ??= (async () => {
    const fromEnv = process.env.BWS_ORG_ID;
    if (fromEnv) return fromEnv;

    if (!process.stdin.isTTY) {
      throw new BwsError(
        "BWS_ORG_ID is not set. The Secrets Manager SDK addresses everything " +
          "by organization id — a public UUID, shown in the Secrets Manager " +
          "URL (bitwarden.com/#/sm/<org-id>/...) and on the machine-account " +
          "page. Put it in your .env; it identifies, it does not authorize.",
      );
    }

    const typed = unwrap(
      await text({
        message:
          "What is the Bitwarden organization id? (the UUID in the Secrets " +
          "Manager URL: bitwarden.com/#/sm/<org-id>/...)",
        validate: (v) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            (v ?? "").trim(),
          )
            ? undefined
            : "That is not a UUID.",
      }),
    ).trim();

    // Saved without a destination question, unlike the token: this is a
    // public identifier with exactly one sensible home, and "ask me every
    // run" is not a state anyone wants for a value that never changes.
    try {
      await saveToDevEnv("BWS_ORG_ID", typed);
      log.success("Stored BWS_ORG_ID in .env.");
    } catch (err) {
      log.warn(
        `Could not save it to .env: ${err instanceof Error ? err.message : String(err)}. ` +
          "Continuing with the id you typed.",
      );
    }
    return typed;
  })();
  resolvedOrgId.catch(() => {
    resolvedOrgId = undefined; // so a later call can ask again
  });
  return resolvedOrgId;
}

/** The lazily-loaded, logged-in SDK client — one per process. */
let sdk: Promise<import("@bitwarden/sdk-napi").BitwardenClient> | undefined;

/**
 * Where the SDK caches its login, so a process is not a fresh authentication.
 *
 * ⚠️ This file is what stops the 429s. Bitwarden's identity endpoint
 * rate-limits repeated access-token logins hard, and "push preflight, audit,
 * push staging, audit, push production, audit" is six devtools processes in
 * two minutes — six logins without this, ONE with it (the `bws` binary kept
 * a state directory for exactly this reason, and the SDK migration dropped
 * it). Per machine account (the token's client-id UUID is in the filename,
 * public by format), under 0700 directories, outside the repository — it
 * caches an auth token, so it must live where nothing syncs or commits it.
 */
function stateFileFor(accessToken: string): string {
  const clientId =
    /^\d+\.([0-9a-f-]{36})\./i.exec(accessToken)?.[1] ?? "default";
  return join(
    homedir(),
    ".config",
    "devdogs-devtools",
    `bws-state-${clientId}.json`,
  );
}

async function client() {
  sdk ??= (async () => {
    const token = await accessToken();
    // Dynamic, so the native module loads only when a command actually
    // talks to Secrets Manager — see the header.
    const { BitwardenClient } = await import("@bitwarden/sdk-napi");
    const instance = new BitwardenClient();
    try {
      const stateFile = stateFileFor(token);
      await mkdir(dirname(stateFile), { recursive: true, mode: 0o700 });
      await withRateLimitRetry(
        () => instance.auth().loginAccessToken(token, stateFile),
        { doing: "the login" },
      );
    } catch (err) {
      throw new BwsError(describeSdkFailure(err, "logging in"));
    }
    return instance;
  })();
  sdk.catch(() => {
    sdk = undefined; // so a later call can retry with a fresh token prompt
  });
  return sdk;
}

/**
 * Turns an SDK failure into something with a next step in it.
 *
 * The two that actually happen are a rejected token and a token that does not
 * cover the project — the latter surfaces as a bare "not found", because a
 * project you cannot see and a project that does not exist are the same
 * answer, deliberately.
 */
function describeSdkFailure(err: unknown, doing: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/\b429\b|too many requests/i.test(message)) {
    return (
      `${message}\n\n` +
      "Bitwarden rate-limited this even after the automatic retries. Wait a " +
      "minute and re-run — the login is cached in a state file now, so " +
      "re-running does not spend another authentication."
    );
  }
  if (/404|not.?found/i.test(message)) {
    return (
      `${message}\n\n` +
      "A 404 here usually means the access token is valid but its machine " +
      "account is not assigned to this project — Secrets Manager reports " +
      "'invisible' and 'absent' identically."
    );
  }
  if (/401|unauthoriz|invalid|expired/i.test(message)) {
    return `${message}\n\nThe access token was rejected while ${doing}. It may have been revoked or belong to another organization.`;
  }
  return message || `Secrets Manager failed with no message while ${doing}.`;
}

function iso(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value !== "") return value;
  return undefined;
}

/** Resolves a project name to its id. Names are unique within an org. */
export async function projectIdFor(name: string): Promise<string> {
  const c = await client();
  const org = await organizationId();
  let projects: { id: string; name: string }[];
  try {
    projects = (
      await withRateLimitRetry(() => c.projects().list(org), {
        doing: "listing projects",
      })
    ).data;
  } catch (err) {
    throw new BwsError(describeSdkFailure(err, "listing projects"));
  }
  const match = projects.find((p) => p.name === name);

  if (!match) {
    const visible = projects.map((p) => p.name).sort();
    throw new BwsError(
      `No project named "${name}".\n` +
        (visible.length > 0
          ? `This token can see: ${visible.join(", ")}`
          : "This token can see no projects at all, which usually means the " +
            "machine account has no project assignments yet."),
    );
  }

  return match.id;
}

export async function listSecrets(projectId: string): Promise<BwsSecret[]> {
  const c = await client();
  const org = await organizationId();
  try {
    // The SDK lists IDENTIFIERS org-wide (only what the token may see), then
    // fetches the values in one batch. Filtered to the project HERE, so the
    // callers' contract — "the secrets of this project" — survives the
    // transport change byte-for-byte.
    const identifiers = (
      await withRateLimitRetry(() => c.secrets().list(org), {
        doing: "listing secrets",
      })
    ).data;
    if (identifiers.length === 0) return [];
    const full = (
      await withRateLimitRetry(
        () => c.secrets().getByIds(identifiers.map((i) => i.id)),
        { doing: "reading secrets" },
      )
    ).data;
    return full
      .filter((s) => s.projectId === projectId)
      .map((s) => ({
        id: s.id,
        key: s.key,
        value: s.value,
        note: s.note,
        projectId,
        revisionDate: iso(s.revisionDate),
      }));
  } catch (err) {
    throw new BwsError(describeSdkFailure(err, "listing secrets"));
  }
}

export async function createSecret(
  projectId: string,
  key: string,
  value: string,
  note: string,
): Promise<void> {
  const c = await client();
  const org = await organizationId();
  try {
    await withRateLimitRetry(
      () => c.secrets().create(org, key, value, note, [projectId]),
      { doing: `creating ${key}` },
    );
  } catch (err) {
    throw new BwsError(describeSdkFailure(err, `creating ${key}`));
  }
}

/**
 * Takes the whole secret rather than an id: the SDK's update is a full
 * replace (organization, key, project list included), and every caller
 * already holds the listed secret it is updating.
 */
export async function updateSecret(
  secret: BwsSecret,
  value: string,
  note: string,
): Promise<void> {
  const c = await client();
  const org = await organizationId();
  try {
    await withRateLimitRetry(
      () =>
        c
          .secrets()
          .update(org, secret.id, secret.key, value, note, [secret.projectId]),
      { doing: `updating ${secret.key}` },
    );
  } catch (err) {
    throw new BwsError(describeSdkFailure(err, `updating ${secret.key}`));
  }
}

export async function deleteSecrets(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const c = await client();
  try {
    await withRateLimitRetry(() => c.secrets().delete(ids), {
      doing: "deleting secrets",
    });
  } catch (err) {
    throw new BwsError(describeSdkFailure(err, "deleting secrets"));
  }
}

export function byKey(secrets: BwsSecret[]): Map<string, BwsSecret> {
  return new Map(secrets.map((s) => [s.key, s]));
}
