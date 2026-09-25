"use server";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { authenticate, expectUserWith } from "../auth";
import { unlinkProfile } from "../auth/providers/github";
import { db } from "../db";
import { oauthRegistrations } from "../db/schema";
import { supabaseAdmin } from "../../supabase/admin";

export default async function unlinkGithubProfile() {
  const user = await expectUserWith({
    profile: { with: { oauthRegistrations: { columns: { clientId: true } } } },
  }).catch(() => authenticate("google", "/account"));

  // A GitHub identity gates EVERY OAuth client a member holds (see
  // OAuthGateDialog), so unlinking takes all of them, not just one.
  const clientIds = user.profile.oauthRegistrations.map((r) => r.clientId);
  await unlinkProfile();

  if (clientIds.length > 0) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(oauthRegistrations)
          .where(eq(oauthRegistrations.userId, user.id));
        await Promise.all(
          clientIds.map((clientId) =>
            supabaseAdmin.auth.admin.oauth.deleteClient(clientId),
          ),
        );
      });
    } catch (cause) {
      console.error(
        JSON.stringify({
          message: "Connected-account side effect failed",
          provider: "github",
          operation: "delete_oauth_client",
          error: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    }
  }

  refresh();
}
