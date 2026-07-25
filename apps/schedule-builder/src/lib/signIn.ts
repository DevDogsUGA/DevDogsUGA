import { env } from "~/env";
import { supabase } from "~/supabase/client";

/**
 * Signs in against the shared Supabase auth instance. In development this uses
 * the platform's OAuth server ("Sign in with DevDogs"); in production it uses
 * the shared Google provider. Controlled by NEXT_PUBLIC_AUTH_MODE.
 */
export default async function signIn() {
  const provider =
    env.NEXT_PUBLIC_AUTH_MODE === "google" ? "google" : "custom:devdogs";

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    console.error("signInWithOAuth error:", error);
  }
}
