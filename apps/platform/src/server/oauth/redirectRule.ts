/**
 * The one redirect rule for every OAuth client (oauth-consent, "Already
 * settled"):
 *
 * - `http` only for `localhost`, `127.0.0.1` and `[::1]`, with any port and
 *   path;
 * - `https` for everything else;
 * - no custom schemes, and no credentials in the address.
 *
 * `platform.oauth_redirect_is_valid(text)` in the database is the same two
 * patterns. `redirectRule.db-test.ts` runs one corpus through both, so they
 * cannot drift apart unnoticed.
 */

export const LOCAL_HTTP_REDIRECT =
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?([/?#]\S*)?$/i;

export const HTTPS_REDIRECT =
  /^https:\/\/[^/?#@:\s]+(:[0-9]{1,5})?([/?#]\S*)?$/i;

const MAX_REDIRECT_LENGTH = 2048;

export function isValidRedirectUri(value: string): boolean {
  return (
    value.length <= MAX_REDIRECT_LENGTH &&
    (LOCAL_HTTP_REDIRECT.test(value) || HTTPS_REDIRECT.test(value))
  );
}

/** A message for a redirect URI the rule refuses, else null. */
export function redirectUriError(value: string): string | null {
  return isValidRedirectUri(value)
    ? null
    : "Redirect URIs must be https://, or http:// only for localhost, 127.0.0.1 and [::1]";
}
