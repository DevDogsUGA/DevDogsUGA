import { createAdminClient } from "@devdogsuga/db/server";
import type { Database } from "@devdogsuga/supabase";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

export const supabaseAdmin = createAdminClient<Database, typeof APP_SCHEMA>({
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  key: env.SECRET_KEY,
  schema: APP_SCHEMA,
});
