import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/server/db";
import { oauthConsentsInAuth } from "~/supabase/drizzle/schema";
import { supabaseAdmin } from "~/supabase/admin";

/**
 * Extracts the Bearer token from an `Authorization` header value.
 * Returns `null` if the header is missing or not a Bearer token.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

/**
 * Returns true when a user ID belongs to a test account that is owned by the
 * developer of the given OAuth client (via oauthTestAccounts → oauthRegistrations).
 */
export async function isTestAccountForClient(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const row = await db.query.oauthTestAccounts.findFirst({
    columns: { testUserId: true },
    where: {
      testUserId: userId,
    },
    with: {
      // oauthTestAccounts.ownerUserId → oauthRegistrations.userId
      user: {
        columns: { id: true },
        with: {
          oauthRegistration: {
            columns: { clientId: true },
          },
        },
      },
    },
  });

  return row?.user?.oauthRegistration?.clientId === clientId;
}

/**
 * Checks whether a real (non-test) user has an active OAuth consent for the
 * given client, verifying they are actually a user of that platform.
 */
export async function hasConsentForClient(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: oauthConsentsInAuth.id })
    .from(oauthConsentsInAuth)
    .where(
      and(
        eq(oauthConsentsInAuth.userId, userId),
        eq(oauthConsentsInAuth.clientId, clientId),
        isNull(oauthConsentsInAuth.revokedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Verifies an end user's Supabase access token and returns their user ID.
 *
 * `getClaims` validates the JWT signature and expiry (locally, via JWKS when
 * possible) and returns the decoded claims, including `sub` (the user ID).
 * Returns `null` if the token is missing, expired, or otherwise invalid.
 */
export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string } | null> {
  const { data, error } = await supabaseAdmin.auth.getClaims(token);
  if (error || !data?.claims.sub) return null;
  return { userId: data.claims.sub };
}
