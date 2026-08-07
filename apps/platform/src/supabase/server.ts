import { createServerClient } from "@devdogsuga/supabase";
import { cookies } from "next/headers";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

/**
 * Creates a Supabase server client backed by Next.js request cookies, scoped
 * to this app's schema. Safe to call from Route Handlers and Server Actions.
 * When called from a Server Component, cookie writes are silently ignored
 * (acceptable since we never need to refresh the Supabase session there).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient({
    url: env.API_URL,
    key: env.PUBLISHABLE_KEY,
    schema: APP_SCHEMA,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
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
