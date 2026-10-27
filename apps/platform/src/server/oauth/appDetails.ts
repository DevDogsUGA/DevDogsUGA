/**
 * An app's details: logo, homepage and privacy policy (oauth-consent Q159).
 * Pure, so the settings action, the form and the tests share one definition.
 */

/** Where a logo lives in the public `avatars` bucket (the consent screen reads the same path). */
export const APP_LOGO_PREFIX = "apps/";
export const APP_LOGO_MAX_BYTES = 256 * 1024;

/** The one path an app's logo is written to; uploading again replaces it. */
export function appLogoPath(clientId: string): string {
  return `${APP_LOGO_PREFIX}${clientId}.webp`;
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
