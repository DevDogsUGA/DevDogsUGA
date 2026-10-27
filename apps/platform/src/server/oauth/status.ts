import { isValidRedirectUri } from "./redirectRule";

/**
 * OAuth app status and the consent decision.
 *
 * Every client is registered with a publishing status
 * (`platform."oauthRegistrations"."status"`, oauth-consent Q154a):
 *
 * - `testing`: only the owner and the owner's test accounts sign in, through
 *   the account picker. Always asks for consent.
 * - `in_production`: every member signs in as themselves, test accounts
 *   excluded (Q164). Asks for consent, unless it is a DevDogs app (no owner)
 *   that skips it (`asksForConsent` false, which a database check allows only
 *   for an ownerless In production app, Q162).
 *
 * Status changes only through the holder-only actions in
 * `~/server/actions/oauthStatus.ts`. Everything here is pure so the consent
 * page, those actions and the tests share one definition.
 */

export const OAUTH_STATUSES = ["testing", "in_production"] as const;

export type OAuthStatus = (typeof OAUTH_STATUSES)[number];

export function parseStatus(value: unknown): OAuthStatus | null {
  return OAUTH_STATUSES.find((status) => status === value) ?? null;
}

/** A member owns at most this many apps, Testing or In production (Q163). */
export const MAX_APPS_PER_MEMBER = 3;

/**
 * The most an app may skip: only an ownerless In production app (Q162). The
 * database check is the enforcement; this is for the form and the action.
 */
export function maySkipConsent(app: {
  ownerUserId: string | null;
  status: OAuthStatus;
}): boolean {
  return app.ownerUserId === null && app.status === "in_production";
}

export type ConsentDecision =
  /** Render nothing: a 404, the same answer as for a stale id. */
  | "not-found"
  /** Approve for the signed-in member and send them back (DevDogs apps only). */
  | "auto-approve"
  /** Show the consent screen to the signed-in member. */
  | "consent"
  /** In production: a test identity signed in, which Q164 refuses with a message. */
  | "test-identity"
  /** Testing: the owner picks themselves or a test account first. */
  | "pick-account";

/**
 * What `/oauth/consent` does for one authorization, decided before anything
 * renders.
 *
 * - An unrecognised status, or a stored return address the redirect rule
 *   refuses, is a 404.
 * - Testing: only the owner sees the picker. A DevDogs app in Testing has no
 *   owner, so nobody does.
 * - In production: a test identity is refused with a message
 *   (`test-identity`, Q164). Everyone else signs in
 *   as themselves; the app either asks (`consent`) or, if it may skip, is
 *   approved at once.
 */
export function decideConsent(input: {
  status: OAuthStatus | null;
  asksForConsent: boolean;
  /** The `redirect_uri` stored on the authorization row. */
  redirectUri: string | null;
  /** The member who registered the client; null for a DevDogs app. */
  ownerUserId: string | null;
  /** The signed-in member. */
  userId: string;
  /** Whether the signed-in member is somebody's test account. */
  isTestIdentity: boolean;
}): ConsentDecision {
  if (input.status === null) return "not-found";
  if (input.redirectUri === null || !isValidRedirectUri(input.redirectUri)) {
    return "not-found";
  }

  if (input.status === "testing") {
    return input.ownerUserId !== null && input.ownerUserId === input.userId
      ? "pick-account"
      : "not-found";
  }

  if (input.isTestIdentity) return "test-identity";
  if (
    !input.asksForConsent &&
    maySkipConsent({ ownerUserId: input.ownerUserId, status: input.status })
  ) {
    return "auto-approve";
  }
  return "consent";
}
