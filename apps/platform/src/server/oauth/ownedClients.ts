import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { oauthRegistrations, oauthTestAccounts } from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";
import { revokeAppAccess } from "./appStatus";

/**
 * The pieces of removing OAuth clients that the settings action
 * (`~/server/actions/oauth.ts`) and the account-deletion job share. They live
 * here, not in the action file, because a `"use server"` module turns every
 * export into a callable endpoint and none of these checks who is asking.
 */

/** Deletes a Supabase OAuth client; one that is already gone counts as deleted. */
export async function deleteSupabaseClient(clientId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.oauth.deleteClient(clientId);
  if (error && error.status !== 404) {
    throw new Error(`Failed to delete OAuth client: ${error.message}`);
  }
}

/**
 * Deletes every test account this user owns and their backing `auth.users`
 * rows, once they hold zero OAuth clients (test accounts exist only to sign
 * into somebody's client).
 */
export async function cleanUpTestAccountsIfNoClientsRemain(
  userId: string,
): Promise<void> {
  const remaining = await db.query.oauthRegistrations.findFirst({
    columns: { clientId: true },
    where: { userId },
  });
  if (remaining) return;

  const testAccounts = await db.query.oauthTestAccounts.findMany({
    columns: { testUserId: true },
    where: { ownerUserId: userId },
  });
  if (testAccounts.length === 0) return;

  // The auth user first, then its row: a failure leaves the row, so a retry
  // finds what is left. A user that is already gone counts as deleted.
  for (const { testUserId } of testAccounts) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(testUserId);
    if (error && error.status !== 404) {
      throw new Error(`Failed to delete a test account: ${error.message}`);
    }
    await db
      .delete(oauthTestAccounts)
      .where(
        and(
          eq(oauthTestAccounts.ownerUserId, userId),
          eq(oauthTestAccounts.testUserId, testUserId),
        ),
      );
  }
}

/**
 * Removes the OAuth apps a member owns because their account is being
 * deleted (account-deletion Q11, oauth-consent Q160): all of them, published
 * or not. Each first has its signed-in members signed out (the kill switch),
 * then its Supabase client deleted, then its registration,
 * then the test accounts that only existed to sign into them.
 *
 * Apps with no owner (the DevDogs apps) are never selected. A production app
 * must never be released to "no owner" here: that status comes only from the
 * holder-only, audited Transfer to DevDogs (Q161). Every step is safe to
 * repeat.
 */
export async function removeMemberOAuthApps(
  userId: string,
): Promise<{ deleted: number }> {
  const owned = await db
    .select({ clientId: oauthRegistrations.clientId })
    .from(oauthRegistrations)
    .where(eq(oauthRegistrations.userId, userId));

  for (const client of owned) {
    // Everyone signed in with the app is signed out first (Q160): deleting a
    // GoTrue client soft-deletes it, which does not end its sessions or
    // approvals. Safe to repeat.
    await revokeAppAccess(db, client.clientId, "everyone_but_owner");
    // Supabase next: the registration's foreign key does not cascade, since
    // GoTrue only soft-deletes. A failure here leaves the registration, so the
    // next run finds the client again.
    await deleteSupabaseClient(client.clientId);
    await db
      .delete(oauthRegistrations)
      .where(
        and(
          eq(oauthRegistrations.clientId, client.clientId),
          eq(oauthRegistrations.userId, userId),
        ),
      );
  }

  await cleanUpTestAccountsIfNoClientsRemain(userId);
  return { deleted: owned.length };
}
