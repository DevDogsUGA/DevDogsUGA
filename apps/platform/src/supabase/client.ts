import { createBrowserClient } from "@devdogsuga/sb";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

/**
 * Creates a Supabase browser client using the public anon key, scoped to this
 * app's schema. Safe to call from client components and hooks.
 * `createBrowserClient` is memoized — repeated calls with the same args
 * return the same instance.
 */
export function createClient() {
  return createBrowserClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    schema: APP_SCHEMA,
  });
}
