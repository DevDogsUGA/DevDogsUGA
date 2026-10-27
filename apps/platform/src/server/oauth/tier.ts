/**
 * OAuth client tiers.
 *
 * "Sign in with DevDogs" has two kinds of client, chosen once at creation
 * (`platform."oauthRegistrations"."tier"`; a trigger rejects any later change):
 *
 * - `development`: a member's own client for local testing. Whoever registered
 *   it can approve it, as themselves or as one of their test accounts.
 * - `production`: a first-party client, one per DevDogs app. Only a holder of
 *   `canManageOAuthApps` can create one, and consent approves it automatically
 *   for whoever signed in, provided its return address is an https Supabase
 *   callback (a product's own Supabase project, never a custom host).
 *
 * Everything here is pure so the consent page, the management actions and the
 * tests all share one definition of "what a production client may do".
 */

export const OAUTH_TIERS = ["development", "production"] as const;

export type OAuthTier = (typeof OAUTH_TIERS)[number];

export function parseTier(value: unknown): OAuthTier | null {
  return OAUTH_TIERS.find((tier) => tier === value) ?? null;
}

/** One label under supabase.co: a project ref (`abc123`) or a vanity name (`dogdays`). */
const SUPABASE_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.supabase\.co$/;

/** The path GoTrue's custom-provider callback lives at. */
export const SUPABASE_CALLBACK_PATH = "/auth/v1/callback";

/**
 * True for `https://<project>.supabase.co/auth/v1/callback` and nothing else:
 * no other scheme, host, port, credentials, query or fragment. This is the
 * return address of a product's own Supabase project completing a custom OIDC
 * sign-in, the only place a production client's authorization code may go.
 */
export function isSupabaseReturnAddress(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    SUPABASE_HOST.test(url.hostname) &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === SUPABASE_CALLBACK_PATH &&
    url.search === "" &&
    url.hash === ""
  );
}

/** A message for a production redirect URI that does not qualify, else null. */
export function productionRedirectUriError(value: string): string | null {
  return isSupabaseReturnAddress(value)
    ? null
    : `Production redirect URIs must be https://<project>.supabase.co${SUPABASE_CALLBACK_PATH}`;
}

export type ConsentDecision =
  /** Render nothing: a 404, the same answer as for a stale id. */
  | "not-found"
  /** Approve for the signed-in user and send them back to the client. */
  | "auto-approve"
  /** Show the owner-and-test-accounts form. */
  | "owner-form";

/**
 * What `/oauth/consent` does for one authorization, decided before anything
 * renders.
 *
 * - A production client is approved automatically when the authorization's
 *   return address is an https Supabase callback, and is a 404 otherwise.
 *   The signed-in user's identity is irrelevant: the token's role is
 *   downgraded by the access-token hook and the user only identifies
 *   themselves to the product.
 * - A development client keeps the old rule: only the member who registered it
 *   sees the form.
 * - Anything else, including an unknown tier, is a 404.
 */
export function decideConsent(input: {
  tier: OAuthTier | null;
  /** The `redirect_uri` stored on the authorization row. */
  redirectUri: string | null;
  /** The member who registered the client; null for a DevDogs app. */
  ownerUserId: string | null;
  /** The signed-in member. */
  userId: string;
}): ConsentDecision {
  if (input.tier === "production") {
    return input.redirectUri !== null &&
      isSupabaseReturnAddress(input.redirectUri)
      ? "auto-approve"
      : "not-found";
  }
  if (input.tier === "development") {
    return input.ownerUserId === input.userId ? "owner-form" : "not-found";
  }
  return "not-found";
}
