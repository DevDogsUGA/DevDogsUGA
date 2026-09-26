import { parseRegistrationParams } from "./registrationParams";

export interface ConnectParams {
  redirectUri: string;
  codeChallenge: string;
  state: string;
  label: string;
  callbackUri: string;
}

export type ConnectParamsResult =
  { ok: true; params: ConnectParams } | { ok: false; error: string };

/**
 * RFC 8252 loopback interface redirection: only a plain-http `127.0.0.1` or
 * `localhost` address, any port, any path. Anything else -- a real host, a
 * scheme other than http -- means the code (and eventually the client
 * secret) could leave the machine that opened the browser, which the rest
 * of this handoff exists specifically to avoid.
 */
function isLoopbackRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  );
}

/**
 * Validates the query string `/tools/oauth/connect` receives from
 * `devtools oauth` (and re-validates the hidden fields the consent form
 * posts back, since those arrive as an ordinary POST body that anyone could
 * forge without ever loading the page). Every failure is reported as a
 * single human-readable `error` string rather than a field map -- the only
 * consumer is an error page, not a form needing per-field messages.
 */
export function parseConnectParams(
  raw: Record<string, string | undefined>,
): ConnectParamsResult {
  const redirectUri = raw.redirect_uri ?? "";
  const codeChallenge = raw.code_challenge ?? "";
  const codeChallengeMethod = raw.code_challenge_method ?? "";
  const state = raw.state ?? "";

  if (!isLoopbackRedirectUri(redirectUri)) {
    return {
      ok: false,
      error:
        "redirect_uri must be an http://127.0.0.1 or http://localhost loopback address.",
    };
  }

  if (codeChallengeMethod !== "S256") {
    return { ok: false, error: "code_challenge_method must be S256." };
  }

  // A SHA-256 digest, base64url-encoded without padding, is always 43
  // characters. Loose enough to allow a slightly different encoder, strict
  // enough to reject an empty or obviously-wrong value up front.
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    return { ok: false, error: "code_challenge is missing or malformed." };
  }

  if (state.length === 0) {
    return { ok: false, error: "state is required." };
  }

  const registration = parseRegistrationParams({
    label: raw.label ?? "",
    callbackUri: raw.callback_uri ?? "",
  });
  if (!registration.ok) return registration;

  return {
    ok: true,
    params: {
      redirectUri,
      codeChallenge,
      state,
      label: registration.params.label,
      callbackUri: registration.params.callbackUri,
    },
  };
}
