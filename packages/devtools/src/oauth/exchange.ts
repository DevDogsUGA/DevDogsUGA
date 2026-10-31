/**
 * The token exchange half of the one-click connect flow: trades the
 * authorization `code` the loopback listener caught, plus the PKCE
 * verifier that matches the challenge sent up front, for the OAuth client
 * credentials the platform minted — see `commands.ts`'s `oauth` node and
 * this repo's launch instructions for the full wire contract this speaks:
 *
 *   POST <platform>/oauth/connect/exchange
 *   { "code", "code_verifier" }
 *
 *   200 { "client_id", "client_secret", "issuer" }
 *   400 { "error": "invalid_request" | "invalid_grant", "error_description" }
 *   429 { "error": "rate_limited" }  (+ Retry-After header)
 */

export type ExchangeErrorKind =
  | "invalid_request"
  | "invalid_grant"
  | "rate_limited"
  | "network"
  | "malformed";

export class ExchangeError extends Error {
  constructor(
    readonly kind: ExchangeErrorKind,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ExchangeError";
  }
}

export interface ExchangeResult {
  clientId: string;
  clientSecret: string;
  issuer: string;
}

function exchangeUrl(platformUrl: string): string {
  return `${platformUrl.replace(/\/+$/, "")}/oauth/connect/exchange`;
}

/**
 * Exchanges `code` + `codeVerifier` for OAuth client credentials.
 *
 * Every failure is a distinct `ExchangeError` kind so the caller (the
 * wizard) can print something specific rather than a bare "request
 * failed": a network failure names the URL and underlying error, a 429
 * carries `Retry-After` when the platform sent one, a 400 distinguishes
 * `invalid_grant` (the code was wrong, expired, or already used — the
 * ordinary "try the flow again" case) from any other `invalid_request`, and
 * a 200 with a body that is not valid JSON or is missing a required field
 * is reported as `malformed` rather than silently returning `undefined`
 * fields to the caller.
 */
export async function exchangeCode({
  platformUrl,
  code,
  codeVerifier,
}: {
  platformUrl: string;
  code: string;
  codeVerifier: string;
}): Promise<ExchangeResult> {
  const url = exchangeUrl(platformUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
    });
  } catch (err) {
    throw new ExchangeError(
      "network",
      `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader
      ? Number(retryAfterHeader)
      : undefined;
    throw new ExchangeError(
      "rate_limited",
      `${url} is rate-limited` +
        (Number.isFinite(retryAfterSeconds)
          ? ` — retry after ${retryAfterSeconds}s.`
          : "."),
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ExchangeError(
      "malformed",
      `${url} did not return valid JSON (status ${response.status}).`,
    );
  }

  if (!response.ok) {
    const errBody = (body ?? {}) as {
      error?: unknown;
      error_description?: unknown;
    };
    const kind: ExchangeErrorKind =
      errBody.error === "invalid_grant" ? "invalid_grant" : "invalid_request";
    const description =
      typeof errBody.error_description === "string"
        ? errBody.error_description
        : undefined;
    const code =
      typeof errBody.error === "string"
        ? errBody.error
        : `HTTP ${response.status}`;
    throw new ExchangeError(
      kind,
      description ? `${code}: ${description}` : code,
    );
  }

  const result = (body ?? {}) as {
    client_id?: unknown;
    client_secret?: unknown;
    issuer?: unknown;
  };
  if (
    typeof result.client_id !== "string" ||
    typeof result.client_secret !== "string" ||
    typeof result.issuer !== "string"
  ) {
    throw new ExchangeError(
      "malformed",
      `${url} returned 200 but was missing client_id, client_secret, or issuer.`,
    );
  }

  return {
    clientId: result.client_id,
    clientSecret: result.client_secret,
    issuer: result.issuer,
  };
}
