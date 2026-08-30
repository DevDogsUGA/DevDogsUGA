/**
 * The Management API calls behind `devtools signing-key`, and nothing else.
 *
 * Two endpoints, verified against the Management API reference on 2026-08-19:
 *
 *   POST /v1/projects/{ref}/config/auth/signing-keys   create (import) a key
 *   GET  /v1/projects/{ref}/config/auth/signing-keys   list keys
 *
 * Authenticated with SUPABASE_ACCESS_TOKEN, the operator's personal access
 * token. Same credential `supabase config push` needs, same rules: apply-tier,
 * devops-only, never in the staging tier. The token travels in a header and is
 * never logged; the response bodies carry no key material (`public_jwk` is null
 * for shared secrets, and the secret itself is never returned, which is the
 * whole reason the secret is minted on this side and imported).
 */

export interface SigningKey {
  id: string;
  algorithm: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

/** The narrowest slice of fetch this module needs; injectable for tests. */
export type Fetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export class SigningKeyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SigningKeyApiError";
  }
}

const BASE = "https://api.supabase.com/v1/projects";

function headers(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function refuse(
  response: { status: number; text(): Promise<string> },
  doing: string,
): Promise<never> {
  const body = (await response.text().catch(() => "")).slice(0, 300);
  const hint =
    response.status === 401
      ? "The access token was rejected — is SUPABASE_ACCESS_TOKEN current?"
      : response.status === 403
        ? "The token lacks the secrets:write (auth_signing_keys) permission " +
          "on this project, or the project ref is not yours."
        : response.status === 429
          ? "Rate limited; wait a minute and re-run."
          : "";
  throw new SigningKeyApiError(
    [`${doing} failed with HTTP ${response.status}.`, hint, body]
      .filter(Boolean)
      .join(" "),
    response.status,
  );
}

/**
 * Imports a shared secret as a NEW signing key, which starts in `standby`.
 *
 * ⚠️ The JWK's `k` is base64url over the UTF-8 BYTES OF THE ENV STRING,
 * matching `createHmac("sha256", signingKey)` in `deploy/mint-token.ts`,
 * which keys HMAC with exactly those bytes. Encoding anything else (say,
 * treating the string as base64url and decoding it first) imports a key that
 * verifies none of our tokens, silently, forever.
 *
 * `status` is deliberately not sent: new keys start in `standby`, which is all
 * the sandbox token needs. Standby keys verify, they just do not sign
 * Supabase's own user sessions. Promoting one to `in_use` changes what signs
 * every session and belongs in the dashboard with a human looking at it.
 */
export async function importSharedSecret(
  projectRef: string,
  accessToken: string,
  secret: string,
  fetchImpl: Fetch = fetch as unknown as Fetch,
): Promise<SigningKey> {
  const response = await fetchImpl(
    `${BASE}/${projectRef}/config/auth/signing-keys`,
    {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({
        algorithm: "HS256",
        private_jwk: {
          kty: "oct",
          k: Buffer.from(secret, "utf8").toString("base64url"),
        },
      }),
    },
  );
  if (!response.ok) await refuse(response, "Importing the signing key");
  return (await response.json()) as SigningKey;
}

export async function listSigningKeys(
  projectRef: string,
  accessToken: string,
  fetchImpl: Fetch = fetch as unknown as Fetch,
): Promise<SigningKey[]> {
  const response = await fetchImpl(
    `${BASE}/${projectRef}/config/auth/signing-keys`,
    { method: "GET", headers: headers(accessToken) },
  );
  if (!response.ok) await refuse(response, "Listing the signing keys");
  const body = (await response.json()) as
    SigningKey[] | { keys?: SigningKey[] };
  // The reference shows a bare array; tolerate a wrapped one rather than
  // reporting "no keys" against a shape change.
  return Array.isArray(body) ? body : (body.keys ?? []);
}
