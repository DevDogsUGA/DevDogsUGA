import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { parseStatus, type OAuthStatus } from "./status";

/**
 * What Supabase Auth shows an app about a member, for the consent screen (E2)
 * to list. Verified against supabase/auth v2.196.0 (the gotrue image the repo's
 * supabase CLI 2.117.0 pins), `internal/api/user.go` and
 * `internal/api/oauthserver/handlers.go`:
 *
 * `GET /auth/v1/user` is NOT scope-filtered. It returns the whole user model
 * (`models.User`) for any valid access token, an OAuth token included:
 *   id, aud, role, email, email_confirmed_at, invited_at, phone,
 *   phone_confirmed_at, confirmation_sent_at, confirmed_at, recovery_sent_at,
 *   new_email, email_change_sent_at, new_phone, phone_change_sent_at,
 *   reauthentication_sent_at, last_sign_in_at, app_metadata, user_metadata,
 *   factors, identities (each with its provider's identity_data), created_at,
 *   updated_at, banned_until, deleted_at, is_anonymous.
 * (Fields tagged omitempty are absent when empty.) The access-token hook
 * re-roles the token to `oauth_identity`, which limits PostgREST, not this.
 *
 * `GET /auth/v1/oauth/userinfo` IS scope-filtered, by the session's scopes
 * (an app asks for `openid email profile`):
 *   always: sub
 *   email:   email, email_verified (only when confirmed)
 *   profile: name (user_metadata.name, else the email), picture
 *            (user_metadata.picture, else avatar_url), preferred_username
 *            (user_metadata.preferred_username, else username), updated_at
 *            (unix seconds), user_metadata (the whole object)
 *   phone:   phone, phone_verified (only when confirmed)
 *
 * A "Supabase custom OIDC provider" (how DogDays and DogPack sign in) reads
 * userinfo, so the consent list should state the userinfo fields; the `/user`
 * list is what an app holding the token could also fetch.
 */

export interface ConsentTarget {
  /** The GoTrue client id, for looking up an existing approval. */
  clientId: string;
  /** The scopes the app asked for, space separated. */
  scope: string;
  /** The member who registered the client; null for a DevDogs app. */
  ownerUserId: string | null;
  status: OAuthStatus | null;
  asksForConsent: boolean;
  /** The `redirect_uri` stored on the authorization row. */
  redirectUri: string | null;
  /** The app's name, as the member registered it. */
  label: string;
  /** Path of the uploaded logo in our storage, or null (letter tile). */
  logoPath: string | null;
  homepageUrl: string | null;
  privacyPolicyUrl: string | null;
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
    columns: {
      clientId: true,
      userId: true,
      status: true,
      asksForConsent: true,
      label: true,
      logoPath: true,
      homepageUrl: true,
      privacyPolicyUrl: true,
    },
    where: { authorizations: { authorizationId } },
    with: {
      authorizations: {
        columns: { redirectUri: true, scope: true },
        where: { authorizationId },
      },
    },
  });
  if (!registration) return null;

  return {
    clientId: registration.clientId,
    scope: registration.authorizations[0]?.scope ?? "",
    ownerUserId: registration.userId,
    status: parseStatus(registration.status),
    asksForConsent: registration.asksForConsent,
    redirectUri: registration.authorizations[0]?.redirectUri ?? null,
    label: registration.label,
    logoPath: registration.logoPath,
    homepageUrl: registration.homepageUrl,
    privacyPolicyUrl: registration.privacyPolicyUrl,
  };
}

/** Whether `userId` is somebody's test account (platform.is_test_identity). */
export async function isTestIdentity(userId: string): Promise<boolean> {
  const rows = await db.execute<{ test: boolean }>(
    sql`select platform.is_test_identity(${userId}::uuid) as test`,
  );
  return rows[0]?.test === true;
}

/** A member's name for the consent screen (their preferred name), or null. */
export async function findDisplayName(userId: string): Promise<string | null> {
  const profile = await db.query.profile.findFirst({
    columns: { preferredName: true },
    where: { userId },
  });
  const name = profile?.preferredName.trim();
  return name === undefined || name === "" ? null : name;
}

/**
 * Whether Supabase Auth already holds an unrevoked approval of `userId` for
 * this client that covers every scope asked for. Approvals are Supabase
 * Auth's (`auth.oauth_consents`); this only reads them, so the first sign-in
 * shows the card and later ones go straight back to the app.
 */
export async function hasActiveConsent(
  userId: string,
  clientId: string,
  scope: string,
): Promise<boolean> {
  const rows = await db.execute<{ scopes: string }>(
    sql`select scopes from auth.oauth_consents
        where user_id = ${userId}::uuid and client_id = ${clientId}::uuid
          and revoked_at is null`,
  );
  const granted = new Set(rows[0]?.scopes.split(/[\s,]+/).filter(Boolean));
  const asked = scope.split(/[\s,]+/).filter(Boolean);
  return rows.length > 0 && asked.every((s) => granted.has(s));
}
