import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "~/supabase/server";
import { env } from "~/env";

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

  cookieStore.set("auth_intent", "link:linkedin_oidc", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const { data, error } = await supabase.auth.linkIdentity({
    provider: "linkedin_oidc",
    options: {
      redirectTo: CALLBACK_URL,
      skipBrowserRedirect: true,
      scopes: "openid profile email",
    },
  });

  if (error ?? !data.url) {
    throw new Error("Failed to initiate LinkedIn OAuth via Supabase");
  }

  redirect(data.url);
}

/**
 * Placeholder for side effects when a LinkedIn profile is linked.
 * The identity link itself is managed by Supabase (`auth.identities`).
 * @param _accessToken The LinkedIn access token from the Supabase OAuth session.
 */
export async function linkProfile(_accessToken: string): Promise<void> {
  // TODO: implement LinkedIn-specific side effects (e.g. org membership)
}

/**
 * Removes a user's LinkedIn identity from Supabase.
 * Placeholder for side effects when a LinkedIn profile is unlinked.
 */
export async function unlinkProfile(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUserIdentities();

  const identity = data?.identities.find((i) => i.provider === "linkedin_oidc");

  if (!identity) return;

  // TODO: implement LinkedIn-specific side effects (e.g. org membership removal)

  await supabase.auth.unlinkIdentity(identity);
}
