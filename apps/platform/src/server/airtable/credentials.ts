import { AirtableClient, BASE_ID } from "@devdogsuga/airtable";
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
  return new AirtableClient({
    baseId: resolveBaseId(),
    token: getAirtableToken(),
  });
}

/**
 * The committed base, unless something is deliberately pointing elsewhere.
 *
 * `BASE_ID` is a constant in the registry rather than a value routed through
 * the env system, because there is one base and every field id beside it
 * belongs to that base. `AIRTABLE_BASE_ID` stays readable so a scratch base
 * can be aimed at without a code change, and is empty in every ordinary
 * deployment.
 */
function resolveBaseId(): string {
  return env.AIRTABLE_BASE_ID || BASE_ID;
}

/**
 * Whether a sync could run at all, for the console to branch on.
 *
 * One condition now, not two. The base is always known — it is committed — so
 * "is Airtable configured" collapses to the one question that still has two
 * answers: do we hold a token. That is worth stating rather than quietly
 * dropping a conjunct, because it also means an unconfigured install is now
 * unambiguously a MISSING CREDENTIAL rather than "one of two things".
 */
export function isAirtableConfigured(): boolean {
  return Boolean(env.AIRTABLE_SYNC_PAT);
}
