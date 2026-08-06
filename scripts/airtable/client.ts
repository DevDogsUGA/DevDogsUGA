import { AirtableClient } from "@devdogsuga/airtable";

/**
 * The client the three scaffolding scripts share.
 *
 * Deliberately NOT `apps/platform/src/server/airtable/credentials.ts`. That
 * path reads the token from Vault, which is right for the running platform and
 * wrong here: these scripts run before the platform is configured, they need
 * `schema.bases:write` — a scope the sync token should not carry — and they are
 * run by a person at a terminal who has the token in hand.
 *
 * So: environment only, and a loud failure rather than a fallback.
 */
export function scaffoldClient(): AirtableClient {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_PAT;

  if (!baseId || !token) {
    console.error(
      "Set AIRTABLE_BASE_ID and AIRTABLE_PAT.\n\n" +
        "The token needs schema.bases:read, schema.bases:write,\n" +
        "data.records:read and data.records:write, and must be minted by\n" +
        "whoever created the workspace -- POST /v0/meta/bases requires the\n" +
        "workspace creator role, which is a person-level permission a scope\n" +
        "cannot grant.\n\n" +
        "See docs/platform/airtable-setup.md.",
    );
    process.exit(1);
  }

  return new AirtableClient({ baseId, token });
}

export function baseId(): string {
  return process.env.AIRTABLE_BASE_ID!;
}
