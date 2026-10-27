import { db } from "~/server/db";
import { parseTier, type OAuthTier } from "./tier";

export interface ConsentTarget {
  /** The member who registered the client; null for a DevDogs app. */
  ownerUserId: string | null;
  tier: OAuthTier | null;
  /** The `redirect_uri` stored on the authorization row. */
  redirectUri: string | null;
}

/**
 * The registration behind one pending authorization, or null when there is no
 * such authorization or its client was never registered. `/oauth/consent`
 * turns null into a 404 before it asks anyone to sign in, so an unknown id, a
 * stale id and an unregistered client are indistinguishable from outside.
 */
export async function findConsentTarget(
  authorizationId: string,
): Promise<ConsentTarget | null> {
  const registration = await db.query.oauthRegistrations.findFirst({
    columns: { userId: true, tier: true },
    where: { authorizations: { authorizationId } },
    with: {
      authorizations: {
        columns: { redirectUri: true },
        where: { authorizationId },
      },
    },
  });
  if (!registration) return null;

  return {
    ownerUserId: registration.userId,
    tier: parseTier(registration.tier),
    redirectUri: registration.authorizations[0]?.redirectUri ?? null,
  };
}
