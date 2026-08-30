import { createAdminClient } from "@devdogsuga/supabase";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

/**
 * Supabase admin client authenticated with the service role key, scoped to
 * this app's schema. Bypasses RLS, so only use it server-side. Never expose
 * this to the client.
 */
export const supabaseAdmin = createAdminClient({
  url: env.API_URL,
  key: env.SECRET_KEY,
  schema: APP_SCHEMA,
});
