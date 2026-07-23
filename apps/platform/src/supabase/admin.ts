import { createClient } from "@supabase/supabase-js";
import { env } from "~/env";
import type { Database } from "./types";

/**
 * Supabase admin client authenticated with the service role key.
 * Only use server-side — never expose this to the client.
 */
export const supabaseAdmin = createClient<Database>(
  env.API_URL,
  env.SECRET_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);
