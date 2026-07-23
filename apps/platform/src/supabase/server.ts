import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "~/env";
import type { Database } from "./types";

/**
 * Creates a Supabase server client backed by Next.js request cookies.
 * Safe to call from Route Handlers and Server Actions.
 * When called from a Server Component, cookie writes are silently ignored
 * (acceptable since we never need to refresh the Supabase session there).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.API_URL, env.PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — cookie writes are not allowed there.
        }
      },
    },
  });
}
