/**
 * Proxy hostnames: one label deep, and never recycled.
 *
 * Pure. The uniqueness guarantee lives in the database — `proxyHostname` is
 * unique and dead environments keep their rows — so this only has to produce a
 * candidate that is a legal single DNS label.
 */

export const SANDBOX_SUFFIX = "-sandbox.devdogsuga.org";

/**
 * The label must contain no dots.
 *
 * `<env>-sandbox.devdogsuga.org`, never `<env>.sandbox.devdogsuga.org`.
 * Cloudflare's Universal SSL covers the apex and first-level subdomains only;
 * anything deeper needs Advanced Certificate Manager at around $10/month. A dot
 * that slips into the label silently moves the hostname a level down, where the
 * wildcard certificate does not reach — and the failure appears as a TLS error
 * on somebody's phone, not as anything this code would report.
 */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
}

/**
 * A short random suffix, always.
 *
 * Not a collision-avoidance measure — the unique constraint handles that — but
 * an unguessability one. Without it a hostname is derivable from a team name,
 * so anybody who knows a team exists knows where its instance lives, and the
 * only thing between them and it is a token they would then go looking for.
 */
function randomSuffix(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function buildProxyHostname(
  environmentName: string,
  suffix = randomSuffix(),
): string {
  const base = slugify(environmentName);
  // An all-punctuation name slugifies to nothing; fall back rather than
  // producing a label that starts with the separator.
  const label = base ? `${base}-${suffix}` : `env-${suffix}`;

  if (!LABEL.test(label)) {
    throw new Error(`Refusing to build an illegal DNS label: ${label}`);
  }
  return `${label}${SANDBOX_SUFFIX}`;
}

/** Guards against a stored hostname that would not resolve under the wildcard. */
export function isValidProxyHostname(hostname: string): boolean {
  if (!hostname.endsWith(SANDBOX_SUFFIX)) return false;
  const label = hostname.slice(0, -SANDBOX_SUFFIX.length);
  return LABEL.test(label);
}
