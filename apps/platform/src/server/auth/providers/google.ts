import type { User } from "@supabase/auth-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "~/env";
import { db } from "~/server/db";
import { profiles } from '~/server/db/schema';
import { createSupabaseServerClient } from "~/supabase/server";

const CALLBACK_URL = new URL("/api/auth/callback", env.BASE_URL).toString();

export async function requestAuthorization(
  callbackPath: string,
): Promise<never> {
  const cookieStore = await cookies();
  const supabase = await createSupabaseServerClient();

  cookieStore.set("auth_callback_path", callbackPath, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  cookieStore.set("auth_intent", "sign-in:google", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: CALLBACK_URL,
      skipBrowserRedirect: true,
      queryParams: { hd: "uga.edu", access_type: "offline" },
    },
  });

  if (error ?? !data.url) {
    throw new Error("Failed to initiate Google OAuth via Supabase");
  }

  redirect(data.url);
}

/**
 * Ensures a DevDogs profile exists for the authenticated Supabase user.
 * Creates a profile record on first sign-in; no-ops on repeat sign-ins.
 * `preferredName` is seeded from the Google display name on creation. The
 * OIDC `name` claim is kept in sync via the `custom_access_token` hook.
 * @param user The Supabase user from the OAuth callback.
 * @see `requestAuthorization`
 */
export async function createUser(user: User): Promise<void> {
  if (!user.email?.endsWith("@uga.edu")) {
    throw new Error("Only @uga.edu accounts are permitted");
  }

  const preferredName =
    (user.user_metadata.full_name as string | undefined) ??
    user.email.split("@")[0]!;

  await db
    .insert(profiles)
    .values({ userId: user.id, preferredName })
    .onConflictDoNothing();
}
