import { AirtableClient } from "@devdogsuga/airtable";
import { env } from "~/env";
import { readVaultSecretByName } from "~/server/vault";

/**
 * Resolving the Airtable personal access token.
 *
 * The token lives in Vault, not in `.env`, for the same reason every other
 * credential does: `.env` is readable by anything that can read the worker's
 * environment, and a PAT scoped to `data.records:write` can rewrite every dues
 * record in the club.
 *
 * Looked up by NAME rather than by a secret id kept in an env var — see
 * `readVaultSecretByName`.
 */
export const AIRTABLE_PAT_SECRET_NAME = "airtable_pat";

export class AirtableNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirtableNotConfiguredError";
  }
}

/**
 * The token, from Vault, or from the environment during bootstrapping.
 *
 * `AIRTABLE_PAT` exists because the scaffolding scripts run before there is
 * anywhere to put a secret — the base has to exist before the platform can be
 * pointed at it. It is deliberately checked SECOND, so once the Vault entry is
 * written a stale env var cannot quietly take precedence over the rotated one.
 *
 * That ordering was silently inverted until the Vault lookup moved to direct
 * SQL: reading it through PostgREST always failed, `null` is indistinguishable
 * from "no secret stored", and the fallback swallowed it. Anyone who had set
 * `AIRTABLE_PAT` got the env var no matter what the Vault held.
 */
export async function getAirtableToken(): Promise<string> {
  const fromVault = await readVaultSecretByName(AIRTABLE_PAT_SECRET_NAME);
  if (fromVault) return fromVault;

  const fromEnv = process.env.AIRTABLE_PAT;
  if (fromEnv) return fromEnv;

  throw new AirtableNotConfiguredError(
    `No Airtable token. Store one in Vault as "${AIRTABLE_PAT_SECRET_NAME}", ` +
      "or set AIRTABLE_PAT while bootstrapping. See docs/platform/airtable-setup.md.",
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

  return new AirtableClient({ baseId, token: await getAirtableToken() });
}

/** Whether a sync could run at all, for the console to branch on. */
export async function isAirtableConfigured(): Promise<boolean> {
  if (!env.AIRTABLE_BASE_ID) return false;
  try {
    await getAirtableToken();
    return true;
  } catch {
    return false;
  }
}
