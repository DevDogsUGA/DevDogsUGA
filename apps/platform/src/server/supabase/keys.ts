/**
 * Picking the right two keys out of `GET /v1/projects/{ref}/api-keys`.
 *
 * Pure, and separated from the HTTP client, because the rule it encodes is the
 * single most measured-and-counterintuitive fact in the whole integration.
 */

export interface ApiKeyRow {
  id?: string;
  type?: string;
  name?: string;
  api_key?: string;
}

export interface SelectedKeys {
  publishable: string;
  secret: string;
}

export class KeySelectionError extends Error {
  constructor(readonly reason: "no_publishable" | "no_secret") {
    super(
      `Could not select ${reason.replace("no_", "")} key from the response`,
    );
    this.name = "KeySelectionError";
  }
}

/**
 * Select on `type`, never on `name`.
 *
 * > **Measured:** a fresh project returns FOUR keys — `anon`, `service_role`,
 * > and _two_ both literally named `default`. The new publishable/secret pair is
 * > distinguishable only by its `type` field, so matching on the name either
 * > picks a deprecated key or is ambiguous depending on array order.
 *
 * The legacy `anon`/`service_role` entries are deliberately not accepted as
 * fallbacks. They are documented as slated for removal in late 2026, and
 * silently falling back to one would mean an environment provisioned today
 * stops working mid-semester with no code change to blame.
 */
export function selectKeys(rows: ApiKeyRow[]): SelectedKeys {
  const publishable = rows.find((row) => row.type === "publishable")?.api_key;
  if (!publishable) throw new KeySelectionError("no_publishable");

  const secret = rows.find((row) => row.type === "secret")?.api_key;
  if (!secret) throw new KeySelectionError("no_secret");

  return { publishable, secret };
}
