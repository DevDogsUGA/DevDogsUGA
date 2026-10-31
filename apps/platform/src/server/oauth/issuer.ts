import { env } from "~/env";
import { parseIssuer } from "./issuerCheck";

/** Discovery is re-read this often, so a host change does not outlive a deploy. */
const ISSUER_TTL_MS = 10 * 60 * 1000;

let cached: { issuer: string; fetchedAt: number } | null = null;

/**
 * The platform Supabase's own OIDC issuer, fetched (and cached) on demand.
 * Shared by every `devtools oauth` endpoint that hands a client its
 * credentials back -- the loopback connect exchange and the device-code
 * token endpoint -- and by the `/dashboard/oauth` page, so all of them report
 * exactly the same issuer without each fetching it independently.
 *
 * It is read from discovery at `API_URL` and never written down: GoTrue
 * stamps this value on every ID token and a provider whose configured issuer
 * differs by a character fails its check, so the only safe answer is whatever
 * the server says it is. See `./issuerCheck.ts` for why it cannot be chosen
 * (TASK-347) and `scripts/check-oauth-issuer.ts` for the check that is run
 * after a host change.
 */
export async function resolveIssuer(): Promise<string> {
  if (cached && Date.now() - cached.fetchedAt < ISSUER_TTL_MS) {
    return cached.issuer;
  }

  const response = await fetch(
    `${env.API_URL}/auth/v1/.well-known/openid-configuration`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenID configuration: ${response.status}`);
  }

  const issuer = parseIssuer(await response.json());
  cached = { issuer, fetchedAt: Date.now() };
  return issuer;
}
