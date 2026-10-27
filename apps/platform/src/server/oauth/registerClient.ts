import { count, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { oauthRegistrations } from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";
import { redirectUriError } from "./redirectRule";
import { MAX_APPS_PER_MEMBER } from "./status";

export interface CreatedOauthClient {
  clientId: string;
  clientSecret: string;
}

/**
 * Deletes a Supabase OAuth client that never got its registration row, so a
 * failed registration cannot leave a live client nobody is accountable for.
 * Best effort: if this fails too there is nothing more to do here than say so
 * loudly, and the original error is still the one the caller sees.
 */
async function discardUnregisteredClient(clientId: string): Promise<void> {
  try {
    const { error } =
      await supabaseAdmin.auth.admin.oauth.deleteClient(clientId);
    if (error) throw error;
  } catch (cause) {
    console.error({
      message: "Could not delete an OAuth client whose registration failed",
      clientId,
      cause,
    });
  }
}

/**
 * Throws when `userId` already owns the most apps a member may (Q163: three,
 * Testing or In production; DevDogs apps have no owner and never count). The
 * database trigger `oauthRegistrations_app_cap` enforces the same limit under
 * concurrency; this check exists so the common case fails before a Supabase
 * client is created, and with a readable message.
 */
export async function assertUnderAppCap(userId: string): Promise<void> {
  const [row] = await db
    .select({ value: count() })
    .from(oauthRegistrations)
    .where(eq(oauthRegistrations.userId, userId));
  if ((row?.value ?? 0) >= MAX_APPS_PER_MEMBER) {
    throw new Error(
      `You can own at most ${MAX_APPS_PER_MEMBER} OAuth apps. Delete one to make another`,
    );
  }
}

/**
 * Creates a fresh Supabase OAuth client for `label`/`redirectUris` and inserts
 * the matching `oauthRegistrations` row so it shows up under `/tools/oauth`.
 * Shared by `devtools oauth`'s two handoffs (the loopback one-click connect,
 * `~/server/actions/oauthConnect.ts`, and the device-code flow,
 * `~/server/actions/oauthDevice.ts`) and by the manual form
 * (`~/server/actions/oauth.ts`), so "what a freshly created client looks like"
 * is defined in exactly one place.
 *
 * The client is created first because its id is the registration's key. If the
 * registration fails, the client is deleted again and the error is rethrown:
 * there is never a client without a registration.
 *
 * Every client starts as a member's own Testing app that asks for consent.
 * Publishing, transferring to DevDogs and skipping consent are holder-only
 * changes made afterwards (`~/server/actions/oauthStatus.ts`). What this
 * enforces is the redirect rule and the three-app cap.
 */
export async function createOauthClientAndRegister(options: {
  label: string;
  redirectUris: string[];
  userId: string;
}): Promise<CreatedOauthClient> {
  const { label, redirectUris, userId } = options;

  for (const uri of redirectUris) {
    const problem = redirectUriError(uri);
    if (problem) throw new Error(problem);
  }
  await assertUnderAppCap(userId);

  const { data, error } = await supabaseAdmin.auth.admin.oauth.createClient({
    client_name: label,
    redirect_uris: redirectUris,
    scope: "openid email profile",
  });
  if (error ?? !data?.client_secret) {
    throw new Error("Failed to create OAuth client");
  }

  try {
    await db
      .insert(oauthRegistrations)
      .values({ userId, clientId: data.client_id, label });
  } catch (cause) {
    await discardUnregisteredClient(data.client_id);
    throw cause;
  }

  return { clientId: data.client_id, clientSecret: data.client_secret };
}
