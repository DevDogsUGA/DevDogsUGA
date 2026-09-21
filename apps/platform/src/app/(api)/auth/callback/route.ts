import { cookies } from "next/headers";
import { notFound, redirect, unauthorized } from "next/navigation";
import type { NextRequest } from "next/server";
import { expectUserWith } from "~/server/auth";
import * as discord from "~/server/auth/providers/discord";
import * as github from "~/server/auth/providers/github";
import * as google from "~/server/auth/providers/google";
import * as linkedin from "~/server/auth/providers/linkedin";
import { createSupabaseServerClient } from "~/supabase/server";
import { withConnectedAccountStatus } from "~/server/auth/connectedAccount";

/**
 * Handles all Supabase OAuth callbacks:
 * - `sign-in:google`:     exchanges code, ensures a DevDogs profile exists
 * - `link:discord`:       exchanges code, then links the Discord profile
 * - `link:github`:        exchanges code, then links the GitHub profile
 * - `link:linkedin_oidc`: exchanges code, then links the LinkedIn profile
 *
 * The intent is read from the short-lived `auth_intent` cookie set by each
 * provider's Route Handler before initiating the Supabase OAuth flow.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const intent = cookieStore.get("auth_intent")?.value ?? "sign-in:google";
  const callbackPath = cookieStore.get("auth_callback_path")?.value ?? "/";
  cookieStore.delete("auth_intent");
  cookieStore.delete("auth_callback_path");

  const errorCode =
    request.nextUrl.searchParams.get("error_code") ??
    request.nextUrl.searchParams.get("error");
  const provider = intent.startsWith("link:") ? intent.slice(5) : "google";
  if (errorCode) {
    console.warn(
      JSON.stringify({
        message: "OAuth provider rejected identity operation",
        operation: intent.startsWith("link:") ? "link" : "sign-in",
        provider,
        errorCode,
      }),
    );
    redirectWithAccountStatus(callbackPath, "error", errorCode, provider);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) notFound();

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
    unauthorized();
  }

  if (user && intent === "sign-in:google") {
    try {
      await google.createUser(user);
    } catch (cause) {
      if (!(cause instanceof google.NonUgaGoogleAccountError)) throw cause;
      await supabase.auth.signOut({ scope: "local" });
      if (callbackPath === "/attendance/complete") {
        redirect("/attendance?status=uga_required");
      }
      redirectWithAccountStatus(
        callbackPath,
        "error",
        "uga_account_required",
        "google",
      );
    }
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
