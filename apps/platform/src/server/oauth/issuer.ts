import { env } from "~/env";

let cachedIssuer: string | null = null;

/**
 * The platform Supabase's own OIDC issuer, fetched (and cached) on demand.
 * Shared by every `devtools oauth` endpoint that hands a client its
 * credentials back -- the loopback connect exchange and the device-code
 * token endpoint -- so both report exactly the same issuer without each
 * fetching (and caching) it independently.
 */
export async function resolveIssuer(): Promise<string> {
  if (cachedIssuer) return cachedIssuer;

  const response = await fetch(
    `${env.API_URL}/auth/v1/.well-known/openid-configuration`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenID configuration: ${response.status}`);
  }

  const config = (await response.json()) as { issuer?: unknown };
  if (typeof config.issuer !== "string" || config.issuer.length === 0) {
    throw new Error("OpenID configuration is missing an issuer");
  }

  cachedIssuer = config.issuer;
  return cachedIssuer;
}
