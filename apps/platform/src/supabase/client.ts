import { createBrowserClient } from "@devdogsuga/supabase";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

/**
 * Creates a Supabase browser client using the public anon key, scoped to this
 * app's schema. Safe to call from client components and hooks.
 *
 * Repeated calls return one instance, because `@supabase/ssr` caches a single
 * browser client: one module-level slot, first call wins, arguments never
 * compared. Every call here passes the same `APP_SCHEMA`, so that cache is
 * harmless; see `@devdogsuga/supabase` for why it would not be otherwise.
 */
export function createClient() {
  return createBrowserClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    schema: APP_SCHEMA,
  });
}
