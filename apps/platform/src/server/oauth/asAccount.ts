import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "~/env";
import { supabaseAdmin } from "~/supabase/admin";
import { createSupabaseServerClient } from "~/supabase/server";
import { approveAuthorization } from "./approveAuthorization";

/**
 * Who an authorization is decided as: the signed-in member themselves, or one
 * of an owner's test accounts on a Testing app (the owner picked it).
 */
export type ConsentActor = { kind: "self" } | { kind: "test"; email: string };

// Only uses client.auth.* (schema-independent).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

/**
 * Runs `fn` with a client signed in as the actor. For a test account that is a
 * magic-link session minted just for this call and revoked when it ends, so a
 * full session for the test account never outlives the request; the app's own
 * token comes from the code exchange and is restricted separately.
 */
async function withActorClient<T>(
  actor: ConsentActor,
  fn: (client: AnyClient) => Promise<T>,
): Promise<T> {
  if (actor.kind === "self") return fn(await createSupabaseServerClient());

  const { data: magicLink, error: magicLinkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: actor.email,
    });
  if (magicLinkError ?? !magicLink.properties.hashed_token) {
    console.error({ magicLinkError });
    throw new Error("Failed to generate magic link");
  }

  const client = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: true },
  });
  const { data: otp, error: otpError } = await client.auth.verifyOtp({
    token_hash: magicLink.properties.hashed_token,
    type: "magiclink",
  });
  if (otpError ?? !otp.session) {
    console.error({ otpError });
    throw new Error("Failed to exchange magic link for session");
  }

  try {
    return await fn(client);
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

/** Approves through Supabase Auth's consent flow; returns where to send them. */
export function approveAs(
  actor: ConsentActor,
  authorizationId: string,
): Promise<string> {
  return withActorClient(actor, (client) =>
    approveAuthorization(client, authorizationId),
  );
}

/** The same redirect with the code dropped and `error=access_denied` set. */
function deniedRedirect(redirectUrl: string): string {
  const url = new URL(redirectUrl);
  const state = url.searchParams.get("state");
  url.search = "";
  url.hash = "";
  url.searchParams.set("error", "access_denied");
  url.searchParams.set(
    "error_description",
    "The user denied the authorization request",
  );
  if (state !== null) url.searchParams.set("state", state);
  return url.toString();
}

/** Cancels: Supabase Auth answers with the app's redirect and `error=access_denied`. */
export function denyAs(
  actor: ConsentActor,
  authorizationId: string,
): Promise<string> {
  return withActorClient(actor, async (client) => {
    // GoTrue only lets an account deny an authorization once it is bound to
    // that account, and fetching the details is what binds it. Done here, not
    // when the page renders, so "Not you?" can still switch accounts first.
    const { data: details, error: detailsError } =
      await client.auth.oauth.getAuthorizationDetails(authorizationId);
    if (detailsError ?? !details) {
      console.error({ detailsError });
      throw new Error("Failed to deny authorization");
    }
    // An earlier approval makes Supabase Auth answer the details call with the
    // success redirect, code included. Cancel must never hand that code on:
    // rebuild the redirect (already validated by GoTrue) as a denial, keeping
    // only its origin, path and `state`.
    if ("redirect_url" in details) return deniedRedirect(details.redirect_url);

    const { data, error } = await client.auth.oauth.denyAuthorization(
      authorizationId,
      { skipBrowserRedirect: true },
    );
    if (error ?? !data.redirect_url) {
      console.error({ error });
      throw new Error("Failed to deny authorization");
    }
    return data.redirect_url;
  });
}
