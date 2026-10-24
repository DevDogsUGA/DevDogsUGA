/**
 * An app's details: logo, homepage and privacy policy (oauth-consent Q159).
 * Pure, so the settings action, the form and the tests share one definition.
 */

/** Where a logo lives in the public `avatars` bucket (the consent screen reads the same path). */
export const APP_LOGO_PREFIX = "apps/";
export const APP_LOGO_MAX_BYTES = 256 * 1024;

/**
 * Each upload gets its own path under the app's folder. Only the path the
 * server records is ever shown, so an upload token signed while the app was in
 * Testing can't change a published app's logo (Q178).
 */
export function appLogoPath(clientId: string, version: string): string {
  return `${APP_LOGO_PREFIX}${clientId}/${version}.webp`;
}

const LOGO_VERSION =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether `path` is one of this app's upload paths (and nothing else). */
export function isAppLogoPath(clientId: string, path: string): boolean {
  const prefix = `${APP_LOGO_PREFIX}${clientId}/`;
  if (!path.startsWith(prefix) || !path.endsWith(".webp")) return false;
  return LOGO_VERSION.test(path.slice(prefix.length, -".webp".length));
}

/** The same shape the database check accepts: https, a host, no credentials. */
const HTTPS_URL = /^https:\/\/[^/?#@\s]+([/?#]\S*)?$/;
const MAX_URL_LENGTH = 2048;

export function isHttpsUrl(value: string): boolean {
  return value.length <= MAX_URL_LENGTH && HTTPS_URL.test(value);
}

/**
 * Reads one optional https address from a form: blank is `null`, anything else
 * must be a valid https address or the message says which field is wrong.
 */
export function parseDetailUrl(
  label: string,
  raw: unknown,
): { value: string | null; error: string | null } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return { value: null, error: null };
  if (!isHttpsUrl(text)) {
    return {
      value: null,
      error: `${label} must be an https:// address with no sign-in details in it`,
    };
  }
  try {
    new URL(text);
  } catch {
    return { value: null, error: `${label} is not a valid address` };
  }
  return { value: text, error: null };
}
