import { AirtableClient } from "@devdogsuga/airtable";
import { env } from "~/env";

/**
 * Resolving the Airtable sync token.
 *
 * It reads `AIRTABLE_SYNC_PAT` from the environment — moved OUT of Supabase
 * Vault ("airtable_pat") on 2026-08-19, by decision. What the move bought:
 * one storage mechanism instead of two, `env audit` can see the copy on the
 * Worker, and the token rides the same Bitwarden → GitHub → Worker path as
 * every other secret. What it traded away, recorded rather than forgotten:
 * an officer can no longer rotate it from the console without a deploy —
 * rotation is Bitwarden → `env push` → the next deploy's secrets-file.
 *
 * ONE source, deliberately. The old resolver had two (Vault, then an
 * `AIRTABLE_PAT` bootstrap fallback), and the fallback ordering was silently
 * inverted for a while — anyone who still had the env var set got it no
 * matter what the Vault held. A single named variable cannot shadow anything.
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
 * A client for the configured base, or a clear refusal.
 *
 * Both the sync pass and the manual trigger call this. Failing here with a
 * named error rather than somewhere inside a request is what lets the officer
 * console say "Airtable is not configured" instead of surfacing a 401 from a
 * vendor.
 */
export async function getAirtableClient(): Promise<AirtableClient> {
  const baseId = env.AIRTABLE_BASE_ID;
  if (!baseId) {
    throw new AirtableNotConfiguredError(
      "AIRTABLE_BASE_ID is not set. See docs/platform/airtable-setup.md.",
    );
  }

  return new AirtableClient({ baseId, token: getAirtableToken() });
}

/** Whether a sync could run at all, for the console to branch on. */
export function isAirtableConfigured(): boolean {
  return Boolean(env.AIRTABLE_BASE_ID) && Boolean(env.AIRTABLE_SYNC_PAT);
}
