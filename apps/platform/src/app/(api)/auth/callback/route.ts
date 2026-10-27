import { cookies } from "next/headers";
import { notFound, redirect, unauthorized } from "next/navigation";
import type { NextRequest } from "next/server";
import { getPendingDeletion } from "~/server/accountDeletion/schedule";
import { expectUserWith } from "~/server/auth";
import * as discord from "~/server/auth/providers/discord";
import * as github from "~/server/auth/providers/github";
import * as google from "~/server/auth/providers/google";
import * as linkedin from "~/server/auth/providers/linkedin";
import { createSupabaseServerClient } from "~/supabase/server";
import { withConnectedAccountStatus } from "~/server/auth/connectedAccount";
import { safeReturnPath } from "~/server/auth/returnPath";
import {
  failureFromProviderError,
  newIncidentRef,
  signInFailureUrl,
} from "~/server/auth/signInFailure";
import { reportSignInIncident } from "~/server/auth/signInIncident";

/**
 * Handles all Supabase OAuth callbacks:
 * - `sign-in:google`:     exchanges code, ensures a DevDogs profile exists
 * - `link:discord`:       exchanges code, then links the Discord profile
 * - `link:github`:        exchanges code, then links the GitHub profile
 * - `link:linkedin_oidc`: exchanges code, then links the LinkedIn profile
 *
 * The intent is read from the short-lived `auth_intent` cookie set by each
 * provider's Route Handler before initiating the Supabase OAuth flow.
 *
 * A sign-in that fails lands on the recovery page (`/auth/failed`) with the
 * destination preserved; a linking failure stays on its settings page as a
 * `connectedAccountStatus` message.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const startedHere = cookieStore.has("auth_intent");
  const intent = cookieStore.get("auth_intent")?.value ?? "sign-in:google";
  const callbackPath = safeReturnPath(
    cookieStore.get("auth_callback_path")?.value,
  );
  cookieStore.delete("auth_intent");
  cookieStore.delete("auth_callback_path");

  const errorParam = request.nextUrl.searchParams.get("error");
  const errorCode =
    request.nextUrl.searchParams.get("error_code") ?? errorParam;
  const isLink = intent.startsWith("link:");
  const provider = isLink ? intent.slice(5) : "google";
  if (errorCode) {
    console.warn(
      JSON.stringify({
        message: "OAuth provider rejected identity operation",
        operation: intent.startsWith("link:") ? "link" : "sign-in",
        provider,
        errorCode,
      }),
    );
    if (isLink) {
      redirectWithAccountStatus(callbackPath, "error", errorCode, provider);
    }
    const failure = failureFromProviderError(errorParam, errorCode);
    if (failure === "cancelled") {
      redirect(signInFailureUrl("cancelled", callbackPath));
    }
    // A request that never began a sign-in here is just a wrong URL; it must
    // not mint incidents or alerts.
    if (!startedHere) notFound();
    failUnexpectedly(callbackPath, "provider_error", { code: errorCode });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    // A visit that never began a sign-in here is just a wrong URL.
    if (isLink || !startedHere) notFound();
    failUnexpectedly(callbackPath, "missing_code", {});
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session, user },
    error,
  } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(
      JSON.stringify({
        message: "Failed to exchange OAuth code",
        provider,
        errorCode: error.code,
        status: error.status,
      }),
    );
    if (isLink) unauthorized();
    failUnexpectedly(callbackPath, "code_exchange", {
      code: error.code,
      status: error.status,
    });
  }

  if (user && intent === "sign-in:google") {
    try {
      await google.createUser(user);
    } catch (cause) {
      await supabase.auth.signOut({ scope: "local" });
      if (!(cause instanceof google.NonUgaGoogleAccountError)) {
        failUnexpectedly(callbackPath, "profile_setup", {
          code: cause instanceof Error ? cause.name : "unknown",
        });
      }
      redirect(signInFailureUrl("wrong_account", callbackPath));
    }
    // A member who signed in while their account is scheduled for deletion
    // lands on the page that says so, with Keep my account, wherever they were
    // headed (account-deletion Q4).
    if (await getPendingDeletion(user.id)) redirect("/account/deletion");
    redirect(callbackPath);
  }

  const devDogsSession = await expectUserWith({
    profile: { columns: { preferredName: true } },
  }).catch(() => unauthorized());

  if (session?.provider_token && intent === "link:discord") {
    if (!devDogsSession.profile) unauthorized();
    try {
      await discord.linkProfile(
        session.provider_token,
        devDogsSession.profile.preferredName,
      );
    } catch (cause) {
      // Supabase has already linked the identity by this point; the guild-join
      // is a best-effort side effect, so a failure here is logged but never
      // surfaced to the user as a failed link.
      logSideEffectFailure("discord", "link", cause);
    }
    redirect(callbackPath);
  }

  if (session?.provider_token && intent === "link:github") {
    try {
      await github.linkProfile(session.provider_token);
    } catch (cause) {
      logSideEffectFailure("github", "link", cause);
      redirectWithAccountStatus(
        callbackPath,
        "warning",
        "external_side_effect_failed",
        "github",
      );
    }
    redirect(callbackPath);
  }

  if (session?.provider_token && intent === "link:linkedin_oidc") {
    try {
      await linkedin.linkProfile(session.provider_token);
    } catch (cause) {
      logSideEffectFailure("linkedin_oidc", "link", cause);
      redirectWithAccountStatus(
        callbackPath,
        "warning",
        "external_side_effect_failed",
        "linkedin_oidc",
      );
    }
    redirect(callbackPath);
  }

  unauthorized();
}

/** Records an incident and sends the visitor to the recovery page with its reference. */
function failUnexpectedly(
  callbackPath: string,
  stage: Parameters<typeof reportSignInIncident>[0]["stage"],
  detail: { code?: string | null; status?: number | null },
): never {
  const ref = newIncidentRef();
  reportSignInIncident({ ref, stage, ...detail });
  redirect(signInFailureUrl("unexpected", callbackPath, ref));
}

function redirectWithAccountStatus(
  callbackPath: string,
  level: "error" | "warning",
  code: string,
  provider: string,
): never {
  redirect(withConnectedAccountStatus(callbackPath, level, code, provider));
}

function logSideEffectFailure(
  provider: string,
  operation: string,
  cause: unknown,
): void {
  console.error(
    JSON.stringify({
      message: "Connected-account side effect failed",
      provider,
      operation,
      error: cause instanceof Error ? cause.message : String(cause),
    }),
  );
}
