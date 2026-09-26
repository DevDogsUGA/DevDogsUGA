import { db } from "~/server/db";
import { oauthRegistrations } from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";

export interface CreatedOauthClient {
  clientId: string;
  clientSecret: string;
}

/**
 * Creates a fresh Supabase OAuth client for `label`/`callbackUri` and
 * inserts the matching `oauthRegistrations` row so it shows up under
 * `/tools/oauth`'s Credentials list. Shared by both `devtools oauth`
 * handoffs -- the loopback one-click connect (`~/server/actions/
 * oauthConnect.ts`) and the device-code flow (`~/server/actions/
 * oauthDevice.ts`) -- so "what a freshly connected client looks like" is
 * defined in exactly one place.
 */
export async function createOauthClientAndRegister(options: {
  label: string;
  callbackUri: string;
  userId: string;
}): Promise<CreatedOauthClient> {
  const { label, callbackUri, userId } = options;

  const { data, error } = await supabaseAdmin.auth.admin.oauth.createClient({
    client_name: label,
    redirect_uris: [callbackUri],
    scope: "openid email profile",
  });
  if (error ?? !data?.client_secret) {
    throw new Error("Failed to create OAuth client");
  }

  await db
    .insert(oauthRegistrations)
    .values({ userId, clientId: data.client_id, label });

  return { clientId: data.client_id, clientSecret: data.client_secret };
}
