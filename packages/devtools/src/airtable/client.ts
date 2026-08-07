import { AirtableClient } from "@devdogsuga/airtable";
import { explain } from "../ui.js";

/**
 * The client the three Airtable commands share.
 *
 * Deliberately NOT `apps/platform/src/server/airtable/credentials.ts`. That
 * path reads the token from Vault, which is right for the running platform and
 * wrong here: these commands run before the platform is configured, they need
 * `schema.bases:write` — a scope the sync token should not carry — and they are
 * run by a person at a terminal who has the token in hand.
 *
 * So: environment only, and a loud failure rather than a fallback.
 */
export interface AirtableCredentials {
  client: AirtableClient;
  baseId: string;
}

export function airtableClient(): AirtableCredentials | null {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_PAT;

  if (!baseId || !token) {
    explain(
      "AIRTABLE_BASE_ID and AIRTABLE_PAT are not set.",
      "These commands read the token from the environment, never from Vault.",
      [
        "1. Add both to the repo's root .env",
        "2. The token needs schema.bases:read, schema.bases:write,",
        "   data.records:read and data.records:write",
        "3. It must be minted by whoever created the workspace --",
        "   POST /v0/meta/bases requires the workspace creator role, which is",
        "   a person-level permission a scope cannot grant",
        "",
        "See docs/platform/airtable-setup.md.",
      ],
    );
    return null;
  }

  return { client: new AirtableClient({ baseId, token }), baseId };
}
