import type { DeployEnvironment } from "@devdogsuga/env";

/**
 * Proxy hostnames: one label deep, never recycled, and PER ENVIRONMENT.
 *
 * Pure. The uniqueness guarantee lives in the database — `proxyHostname` is
 * unique and dead environments keep their rows — so this only has to produce a
 * candidate that is a legal single DNS label under the right suffix.
 */

/**
 * The suffix each deployment's Worker route actually claims.
 *
 * This was one constant, `-sandbox.devdogsuga.org`, with no environment
 * awareness — while `apps/sandbox/wrangler.jsonc` routes staging at
 * `*-sandbox-staging.devdogsuga.org/*`. Nothing generated a hostname matching
 * that pattern, so no request ever reached the staging Worker: a staging
 * environment provisioned as `lantern-abc-sandbox.devdogsuga.org` matched
 * PRODUCTION's wildcard instead, where the production Worker resolved the token
 * against the production database and answered `410`. Staging sandboxes could
 * not work, and the failure named the member's token rather than the routing.
 *
 * Each entry must stay in step with the `routes` block of that wrangler config;
 * they are two halves of one fact, and this is the half that writes rows.
 * Changing a suffix later means rewriting every stored `proxyHostname` in that
 * environment's database.
 *
 * Development shares staging's suffix. `wrangler dev` has no route at all — it
 * serves locally and reads `proxyHostname` from the database — so the value is
 * unreachable in practice; pointing it at staging rather than production means
 * a row that somehow escaped a dev machine lands on the environment that can
 * absorb it.
 */
export const SANDBOX_SUFFIXES = {
  development: "-sandbox-staging.devdogsuga.org",
  staging: "-sandbox-staging.devdogsuga.org",
  production: "-sandbox.devdogsuga.org",
} as const satisfies Record<DeployEnvironment, string>;

export function sandboxSuffix(deployEnv: DeployEnvironment): string {
  return SANDBOX_SUFFIXES[deployEnv];
}

/**
 * The label must contain no dots.
 *
 * `<env>-sandbox.devdogsuga.org`, never `<env>.sandbox.devdogsuga.org`.
 * Cloudflare's Universal SSL covers the apex and first-level subdomains only;
 * anything deeper needs Advanced Certificate Manager at around $10/month. A dot
 * that slips into the label silently moves the hostname a level down, where the
 * wildcard certificate does not reach — and the failure appears as a TLS error
 * on somebody's phone, not as anything this code would report.
 *
 * Every suffix above is itself one label deep, so this holds for all of them.
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

export interface ProxyHostnameOptions {
  /**
   * Which deployment this row is being written for. Required rather than
   * defaulted: a default is what produced a single environment-blind constant,
   * and the wrong answer here is invisible until a member cannot reach their
   * sandbox.
   */
  deployEnv: DeployEnvironment;
  /** Overridable only so tests can pin it. */
  suffix?: string;
}

export function buildProxyHostname(
  environmentName: string,
  options: ProxyHostnameOptions,
): string {
  const base = slugify(environmentName);
  // An all-punctuation name slugifies to nothing; fall back rather than
  // producing a label that starts with the separator.
  const random = options.suffix ?? randomSuffix();
  const label = base ? `${base}-${random}` : `env-${random}`;

  if (!LABEL.test(label)) {
    throw new Error(`Refusing to build an illegal DNS label: ${label}`);
  }
  return `${label}${sandboxSuffix(options.deployEnv)}`;
}

/** Guards against a stored hostname that would not resolve under the wildcard. */
export function isValidProxyHostname(
  hostname: string,
  deployEnv: DeployEnvironment,
): boolean {
  const suffix = sandboxSuffix(deployEnv);
  if (!hostname.endsWith(suffix)) return false;
  const label = hostname.slice(0, -suffix.length);
  return LABEL.test(label);
}
