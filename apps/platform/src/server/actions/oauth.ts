"use server";

import { eq } from "drizzle-orm";
import { authenticate, expectUserWith } from "../auth";
import { db } from "../db";
import { oauthRegistrations } from "../db/schema";
import { supabaseAdmin } from "../../supabase/admin";

const MAX_REDIRECT_URIS = 5;

const DEFAULT_REDIRECT_URIS = [
  "http://localhost:3000/auth", // Community Resource Forum
];

export type OAuthState = {
  clientId: string | null;
  clientSecret: string | null;
  redirectUris: string[];
};

export default async function oauthAction(
  prev: OAuthState,
  formData: FormData,
): Promise<OAuthState> {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const intent = formData.get("intent")?.toString();

  const user = await expectUserWith({
    profile: { with: { oauthRegistration: true } },
    githubIdentity: { columns: { id: true } },
  }).catch(() => authenticate("google", "/tools/oauth"));

  const clientId = user.profile?.oauthRegistration?.clientId ?? null;

  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (intent) {
    case "toggle-client": {
      if (clientId) {
        // Fetch test account IDs before deleting so we can clean up the
        // backing auth.users rows after the DB transaction.
        const testAccounts = await db.query.oauthTestAccounts.findMany({
          columns: { testUserId: true },
          where: { ownerUserId: user.id },
        });

        await db.transaction(async (tx) => {
          await tx
            .delete(oauthRegistrations)
            .where(eq(oauthRegistrations.userId, user.id));
          await supabaseAdmin.auth.admin.oauth.deleteClient(clientId);
        });

        await Promise.all(
          testAccounts.map(({ testUserId }) =>
            supabaseAdmin.auth.admin.deleteUser(testUserId),
          ),
        );

        return {
          clientId: null,
          clientSecret: null,
          redirectUris: [],
        };
      }

      if (!user.githubIdentity) {
        throw new Error(
          "A linked GitHub account is required to create an OAuth client",
        );
      }

      const { data, error } = await supabaseAdmin.auth.admin.oauth.createClient(
        {
          client_name: user.id,
          redirect_uris: DEFAULT_REDIRECT_URIS,
          scope: "openid email profile",
        },
      );

      if (error ?? !data) throw new Error("Failed to create OAuth client");

      await db
        .insert(oauthRegistrations)
        .values({ userId: user.id, clientId: data.client_id });

      return {
        clientId: data.client_id,
        clientSecret: data.client_secret ?? null,
        redirectUris: data.redirect_uris,
      };
    }

    case "reset-secret": {
      if (!clientId) throw new Error("No OAuth client exists");

      const { data, error } =
        await supabaseAdmin.auth.admin.oauth.regenerateClientSecret(clientId);
      if (error || !data)
        throw new Error(
          `Failed to regenerate client secret: ${error?.message}`,
        );

      return { ...prev, clientId, clientSecret: data.client_secret ?? null };
    }

    case "add-uri": {
      if (!clientId) throw new Error("No OAuth client exists");

      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const uri = formData.get("uri")?.toString().trim() ?? "";

      let parsed: URL;
      try {
        parsed = new URL(uri);
      } catch {
        throw new Error("Invalid URL");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Redirect URIs must use http:// or https://");
      }

      const { data: existing, error: getError } =
        await supabaseAdmin.auth.admin.oauth.getClient(clientId);
      if (getError || !existing)
        throw new Error(`Failed to fetch OAuth client: ${getError?.message}`);

      if (existing.redirect_uris.includes(uri)) return prev;

      if (existing.redirect_uris.length >= MAX_REDIRECT_URIS) {
        throw new Error(
          `A maximum of ${MAX_REDIRECT_URIS} redirect URIs are allowed`,
        );
      }

      const updated = [...existing.redirect_uris, uri];
      await supabaseAdmin.auth.admin.oauth.updateClient(clientId, {
        redirect_uris: updated,
      });
      return { ...prev, redirectUris: updated };
    }

    case "remove-uri": {
      if (!clientId) throw new Error("No OAuth client exists");

      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const uri = formData.get("uri")?.toString().trim() ?? "";

      const { data: existing, error: getError } =
        await supabaseAdmin.auth.admin.oauth.getClient(clientId);
      if (getError || !existing)
        throw new Error(`Failed to fetch OAuth client: ${getError?.message}`);

      const updated = existing.redirect_uris.filter((u) => u !== uri);
      await supabaseAdmin.auth.admin.oauth.updateClient(clientId, {
        redirect_uris: updated,
      });
      return { ...prev, redirectUris: updated };
    }

    default:
      throw new Error(`Unknown intent: ${String(intent)}`);
  }
}
