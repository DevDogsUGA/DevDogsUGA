import { createBrowserClient } from "@devdogsuga/sb";
import { env } from "~/env";
import { APP_SCHEMA } from "./schema";

export const supabase = createBrowserClient({
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  schema: APP_SCHEMA,
});
