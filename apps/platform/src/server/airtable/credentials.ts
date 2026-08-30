import { AirtableClient, BASE_ID } from "@devdogsuga/airtable";
import { env } from "~/env";

/**
 * Raised when the Airtable sync token is missing.
 *
 * The token is `AIRTABLE_SYNC_PAT` in the environment, moved out of Supabase
 * Vault ("airtable_pat") on 2026-08-19 by decision. The move bought one
 * storage mechanism instead of two, `env audit` visibility of the copy on the
 * Worker, and the same Bitwarden → GitHub → Worker path as every other secret.
 * It cost console rotation: an officer now rotates via Bitwarden → `env push`
 * → the next deploy's secrets-file.
 *
 * ONE source, deliberately. The old resolver read Vault first and fell back to
 * an `AIRTABLE_PAT` bootstrap var, and that ordering was silently inverted for
 * a while, so anyone who still had the env var set got it no matter what the
 * Vault held. A single named variable cannot shadow anything.
 */
export class AirtableNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirtableNotConfiguredError";
  }
}

/** @throws {AirtableNotConfiguredError} when the token is unset. */
export function getAirtableToken(): string {
  if (env.AIRTABLE_SYNC_PAT) return env.AIRTABLE_SYNC_PAT;

  throw new AirtableNotConfiguredError(
    "AIRTABLE_SYNC_PAT is not set. It belongs in the environment like every " +
      "other secret — see docs/platform/airtable-setup.md.",
  );
}

/**
 * A client for the configured base, or a named refusal.
 *
 * Both the sync pass and the manual trigger call this. Failing here with a
 * named error rather than somewhere inside a request is what lets the officer
 * console say "Airtable is not configured" instead of surfacing a vendor 401.
 */
export async function getAirtableClient(): Promise<AirtableClient> {
  return new AirtableClient({
    baseId: resolveBaseId(),
    token: getAirtableToken(),
  });
}

/**
 * The committed base, unless `AIRTABLE_BASE_ID` points elsewhere.
 *
 * `BASE_ID` is a registry constant rather than a value routed through the env
 * system, because there is one base and every field id beside it belongs to
 * it. The override exists so a scratch base can be aimed at without a code
 * change, and is empty in every ordinary deployment.
 */
function resolveBaseId(): string {
  return env.AIRTABLE_BASE_ID || BASE_ID;
}

/**
 * Whether a sync could run at all, for the console to branch on.
 *
 * One condition, not two. The base is committed and so always known, leaving
 * only the question of whether we hold a token. That also makes an
 * unconfigured install unambiguously a MISSING CREDENTIAL rather than "one of
 * two things".
 */
export function isAirtableConfigured(): boolean {
  return Boolean(env.AIRTABLE_SYNC_PAT);
}
