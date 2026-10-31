/**
 * What the platform's OAuth server must advertise for a product project to
 * register "Sign in with DevDogs" against it (TASK-347).
 *
 * The issuer is not ours to choose. GoTrue reports `config.JWT.Issuer` in its
 * discovery document and stamps it on every ID token, and a product's custom
 * OIDC provider (go-oidc) refuses a provider whose configured issuer is not
 * byte-for-byte the one the discovery document returns. On hosted Supabase that
 * value is `https://<project>.supabase.co/auth/v1`, and the Management API has
 * no field to change it: it stayed on the project ref host even while the
 * `api.devdogsuga.org` custom domain was active. So the rule is not "make the
 * platform advertise X" but "register exactly what discovery returns, and
 * check what it returns whenever the host in front of the project changes".
 * The platform's `API_URL` (the host it reads discovery from) is
 * `https://devdogsuga.supabase.co` in production after the vanity-subdomain
 * switch and the project ref host on staging, and everything that shows an
 * issuer (the `/dashboard/oauth` page, the `devtools oauth` handoffs) reads it
 * from discovery rather than writing it down.
 *
 * Pure on purpose: `apps/platform/scripts/check-oauth-issuer.ts` runs it
 * against a live project and the unit tests run it on fixtures.
 */

export interface OidcDiscovery {
  issuer?: unknown;
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
  jwks_uri?: unknown;
  registration_endpoint?: unknown;
}

const SUPABASE_ISSUER =
  /^https:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.supabase\.co\/auth\/v1$/;

/** The project label of a `https://<label>.supabase.co/auth/v1` issuer, else null. */
export function supabaseIssuerLabel(issuer: string): string | null {
  return SUPABASE_ISSUER.exec(issuer)?.[1] ?? null;
}

/** The issuer string of a discovery document, or an error saying what is missing. */
export function parseIssuer(config: unknown): string {
  const issuer = (config as OidcDiscovery | null)?.issuer;
  if (typeof issuer !== "string" || issuer.length === 0) {
    throw new Error("OpenID configuration is missing an issuer");
  }
  return issuer;
}

export interface IssuerCheck {
  ok: boolean;
  issuer: string | null;
  problems: string[];
}

/**
 * Checks a discovery document (and optionally its JWKS) against what a
 * product's `custom:devdogsuga` provider needs.
 *
 * @param expectLabel the project label the issuer must name (`devdogsuga` for
 *   `devdogsuga.supabase.co`, or the staging ref). Omit to accept any project.
 */
export function checkDiscovery(
  discovery: unknown,
  options: { expectLabel?: string; jwks?: { keys?: unknown } | null } = {},
): IssuerCheck {
  const problems: string[] = [];
  const doc = (discovery ?? {}) as OidcDiscovery;

  let issuer: string | null = null;
  try {
    issuer = parseIssuer(discovery);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  if (issuer !== null) {
    const label = supabaseIssuerLabel(issuer);
    if (label === null) {
      problems.push(
        `issuer ${issuer} is not https://<project>.supabase.co/auth/v1`,
      );
    } else if (options.expectLabel && label !== options.expectLabel) {
      problems.push(
        `issuer names ${label}.supabase.co, expected ${options.expectLabel}.supabase.co`,
      );
    }
  }

  for (const field of [
    "authorization_endpoint",
    "token_endpoint",
    "jwks_uri",
  ] as const) {
    const value = doc[field];
    if (typeof value !== "string" || !value.startsWith("https://")) {
      problems.push(`${field} is missing or not https`);
    }
  }

  // Dynamic client registration must stay off: anyone could mint a client.
  if (
    doc.registration_endpoint !== undefined &&
    doc.registration_endpoint !== null
  ) {
    problems.push(
      "registration_endpoint is advertised (dynamic registration is on)",
    );
  }

  if (options.jwks !== undefined) {
    const keys = options.jwks?.keys;
    if (!Array.isArray(keys) || keys.length === 0) {
      problems.push("jwks has no keys");
    } else {
      for (const key of keys as { kty?: unknown; kid?: unknown }[]) {
        if (key.kty !== "EC" && key.kty !== "RSA") {
          problems.push(
            `jwks key ${String(key.kid)} is ${String(key.kty)}, not an asymmetric key`,
          );
        }
      }
    }
  }

  return { ok: problems.length === 0, issuer, problems };
}
