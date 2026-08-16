/**
 * Finding the Secrets Manager access token, in four places, in order.
 *
 *   1. `--access-token`   explicit, and explicit beats ambient
 *   2. `BWS_ACCESS_TOKEN` the environment — the documented way
 *   3. the Bitwarden Password Manager vault, via `bw`
 *   4. ask, and offer to save it to the vault so this is the last time
 *
 * The ordering logic is separated from the four implementations because it is
 * the part that can be wrong invisibly. A chain that silently prefers a stale
 * environment variable over a rotated vault entry authenticates as the wrong
 * account and reports nothing, so the order is asserted rather than assumed.
 */
import { log, password } from "@clack/prompts";
import { unwrap } from "../ui.js";

export class NoAccessTokenError extends Error {}

export interface TokenSources {
  /** From `--access-token`. */
  explicit?: string;
  /** From `process.env.BWS_ACCESS_TOKEN`. */
  env?: string;
  /** `undefined` for every reason the vault might not have it. */
  fromVault: () => Promise<string | undefined>;
  /** `undefined` when there is nobody to ask. */
  prompt: () => Promise<string | undefined>;
  /** Asked only after a successful prompt. */
  offerSave: () => Promise<boolean>;
  save: (token: string) => Promise<void>;
  /** Where the token came from, for the caller to report. */
  onSource?: (source: TokenSource) => void;
}

export type TokenSource = "flag" | "environment" | "vault" | "prompt";

export async function resolveToken(sources: TokenSources): Promise<string> {
  const announce = sources.onSource ?? (() => {});

  // Explicit beats ambient. Someone who passes the flag while an environment
  // variable is set is overriding on purpose, and silently ignoring them would
  // point the command at the account they were trying to avoid.
  if (sources.explicit) {
    announce("flag");
    return sources.explicit;
  }

  if (sources.env) {
    announce("environment");
    return sources.env;
  }

  const stored = await sources.fromVault();
  if (stored) {
    announce("vault");
    return stored;
  }

  const typed = await sources.prompt();
  if (!typed) {
    throw new NoAccessTokenError(
      "No access token. Set BWS_ACCESS_TOKEN, pass --access-token, or store " +
        "one in your Bitwarden vault. See docs/platform/env.md.",
    );
  }
  announce("prompt");

  // Offered only for a token that was just typed. Saving one that came from a
  // flag or the environment would copy a credential into a vault nobody asked
  // to put it in.
  if (await sources.offerSave()) {
    // A failed vault write must not lose the token. Somebody just pasted a live
    // credential; making them do it again because a write failed is the worst
    // moment to be strict, and the command itself is unaffected.
    try {
      await sources.save(typed);
    } catch (err) {
      log.warn(
        `Could not save to your vault: ${err instanceof Error ? err.message : String(err)}. ` +
          "Continuing with the token you typed.",
      );
    }
  }

  return typed;
}

/**
 * A weak shape check, to turn a paste error into a sentence rather than a 401.
 *
 * Machine account tokens are `0.<uuid>.<secret>:<secret>`. This checks the
 * leading version segment only, and **warns rather than refuses**: the format
 * is Bitwarden's to change, and a tool that rejects a valid token because its
 * prefix moved is worse than one that passes a bad token to `bws` and lets the
 * real error surface.
 */
export function looksLikeAccessToken(value: string): boolean {
  return /^\d+\.[0-9a-f-]{36}\./i.test(value.trim());
}

/** The interactive half. Masked, and never echoed back. */
export async function promptForToken(): Promise<string | undefined> {
  if (!process.stdin.isTTY) return undefined;

  const typed = unwrap(
    await password({
      message: "Paste the Secrets Manager access token for the `admin` account",
      mask: "•",
      validate: (v) =>
        (v ?? "").trim() === "" ? "An access token is required." : undefined,
    }),
  ).trim();

  if (!looksLikeAccessToken(typed)) {
    log.warn(
      "That does not look like a machine account access token (they start " +
        "`0.<uuid>.`). Continuing anyway — if it is wrong, Bitwarden will say so.",
    );
  }

  return typed;
}
