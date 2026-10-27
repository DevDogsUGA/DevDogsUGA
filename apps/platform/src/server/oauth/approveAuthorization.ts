import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Approves one pending OAuth authorization as the user `client` is signed in
 * as, and returns where to send them next (the client's redirect URI with the
 * authorization code appended).
 *
 * Shared by the two ways consent happens on this platform: a production
 * client's automatic approval (`/oauth/consent`, signed in as the member) and a
 * development client's owner approving as one of their test accounts
 * (`allowConsent`, via `approveAs`). Neither decision is made here: callers
 * have already checked the tier and who is allowed to approve.
 */
export async function approveAuthorization(
  // Only uses client.auth.* (schema-independent), so accept any schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any, any, any>,
  authorizationId: string,
): Promise<string> {
  const { data: authorizationDetails, error: authorizationDetailsError } =
    await client.auth.oauth.getAuthorizationDetails(authorizationId);

  if (authorizationDetailsError ?? !authorizationDetails) {
    console.error({ authorizationDetailsError });
    throw new Error("Failed to approve authorization");
  }

  if ("redirect_url" in authorizationDetails) {
    // User has previously approved authorization
    return authorizationDetails.redirect_url;
  }

  const { data: authorizationApproval, error: authorizationApprovalError } =
    await client.auth.oauth.approveAuthorization(authorizationId, {
      skipBrowserRedirect: true,
    });

  if (authorizationApprovalError ?? !authorizationApproval.redirect_url) {
    console.error({ error: authorizationApprovalError });
    throw new Error("Failed to approve authorization");
  }

  return authorizationApproval.redirect_url;
}
