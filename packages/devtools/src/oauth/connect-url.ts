/**
 * Builds the platform's `/oauth/connect` URL — the page a browser
 * opens to approve a `devtools oauth` connection. See this repo's launch
 * instructions for the fixed wire contract: `redirect_uri`, `code_challenge`
 * (base64url SHA-256 of the PKCE verifier, no padding — `pkce.ts`),
 * `code_challenge_method=S256`, `state`, `label` (1–100 characters), and
 * `callback_uri` (the TARGET Supabase project's own `/auth/v1/callback` —
 * NOT this loopback listener's URL; that is `redirect_uri`).
 */
export function buildConnectUrl({
  platformUrl,
  redirectUri,
  codeChallenge,
  state,
  label,
  callbackUri,
}: {
  platformUrl: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  label: string;
  callbackUri: string;
}): string {
  const url = new URL(`${platformUrl.replace(/\/+$/, "")}/oauth/connect`);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  // The wire contract caps this at 100 characters; truncated here rather
  // than left for the platform to reject, since the label is a cosmetic
  // default (project name / directory name — see `label.ts`), not something
  // worth failing the whole connect flow over.
  url.searchParams.set("label", label.slice(0, 100));
  url.searchParams.set("callback_uri", callbackUri);
  return url.toString();
}
