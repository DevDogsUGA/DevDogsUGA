import { createServerClient } from "@devdogsuga/supabase";
import { cookies } from "next/headers";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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
          // setAll called from a Server Component; middleware handles refresh
        }
      },
    },
  });
}
