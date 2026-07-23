import { createAdminClient } from "@devdogsuga/sb";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

export const supabaseAdmin = createAdminClient({
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  key: env.SECRET_KEY,
  schema: APP_SCHEMA,
});
