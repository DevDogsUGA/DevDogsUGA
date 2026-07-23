import { cookies } from "next/headers";
import { notFound, redirect, unauthorized } from "next/navigation";
import type { NextRequest } from "next/server";
import { expectUserWith } from "~/server/auth";
import * as discord from "~/server/auth/providers/discord";
import * as github from "~/server/auth/providers/github";
import * as google from "~/server/auth/providers/google";
import * as linkedin from "~/server/auth/providers/linkedin";
import { createSupabaseServerClient } from "~/supabase/server";

/**
 * Handles all Supabase OAuth callbacks:
 * - `sign-in:google`  — exchanges code, ensures a DevDogs profile exists
 * - `link:discord`       — exchanges code, then links the Discord profile
 * - `link:github`        — exchanges code, then links the GitHub profile
 * - `link:linkedin_oidc` — exchanges code, then links the LinkedIn profile
 *
 * The intent is read from the short-lived `auth_intent` cookie set by each
 * provider's Route Handler before initiating the Supabase OAuth flow.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    notFound();
  }

  const cookieStore = await cookies();
  const intent = cookieStore.get("auth_intent")?.value ?? "sign-in:google";
  const callbackPath = cookieStore.get("auth_callback_path")?.value ?? "/";
  cookieStore.delete("auth_intent");
  cookieStore.delete("auth_callback_path");

  const supabase = await createSupabaseServerClient();
  const {
    data: { session, user },
    error,
  } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Failed to exchange OAuth code", error);
    unauthorized();
  }

  if (user && intent === "sign-in:google") {
    await google.createUser(user);
    redirect(callbackPath);
  }

  const devDogsSession = await expectUserWith({
    profile: { columns: { preferredName: true } },
  }).catch(() => unauthorized());

  if (session?.provider_token && intent === "link:discord") {
    if (!devDogsSession.profile) unauthorized();
    await discord.linkProfile(
      session.provider_token,
      devDogsSession.profile.preferredName,
      devDogsSession.id,
    );
    redirect(callbackPath);
  }

  if (session?.provider_token && intent === "link:github") {
    await github.linkProfile(session.provider_token);
    redirect(callbackPath);
  }

  if (session?.provider_token && intent === "link:linkedin_oidc") {
    await linkedin.linkProfile(session.provider_token);
    redirect(callbackPath);
  }

  unauthorized();
}
