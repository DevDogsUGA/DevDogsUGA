"use server";

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { authenticate, expectUserWith } from "../auth";
import { db } from "../db";
import { oauthRegistrations } from '../db/schema';
import { supabaseAdmin } from "../../supabase/admin";

const MAX_REDIRECT_URIS = 5;

const DEFAULT_REDIRECT_URIS = [
  "http://localhost:3000/api/auth", // Community Resource Forum
];

export type OAuthState = {
  clientId: string | null;
  clientSecret: string | null;
  redirectUris: string[];
  /**
   * Set once after `generate-report-key` or `regenerate-webhook-secret`.
   * Cleared on the next action. The client must copy it immediately.
   */
  reportApiKey: string | null;
  webhookSecret: string | null;
  reportWebhookUrl: string | null;
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
          reportApiKey: null,
          webhookSecret: null,
          reportWebhookUrl: null,
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
        reportApiKey: null,
        webhookSecret: null,
        reportWebhookUrl: null,
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

    case "set-webhook-url": {
      if (!clientId) throw new Error("No OAuth client exists");

      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const url = formData.get("webhookUrl")?.toString().trim() ?? "";

      if (url) {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error("Invalid webhook URL");
        }
        if (parsed.protocol !== "https:") {
          throw new Error("Webhook URL must use HTTPS");
        }
      }

      await db
        .update(oauthRegistrations)
        .set({ reportWebhookUrl: url || null })
        .where(eq(oauthRegistrations.clientId, clientId));

      return {
        ...prev,
        reportWebhookUrl: url || null,
        reportApiKey: null,
        webhookSecret: null,
      };
    }

    case "regenerate-webhook-secret": {
      if (!clientId) throw new Error("No OAuth client exists");

      const rawSecret = randomBytes(32).toString("hex");

      // Store the secret encrypted in Supabase Vault.
      // The `vault` schema is not in the generated Supabase types.
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      const admin = supabaseAdmin as any;

      // Fetch existing secret ID so we can update rather than insert when
      // the developer regenerates.
      const registration = await db.query.oauthRegistrations.findFirst({
        columns: { reportWebhookSecretId: true },
        where: { clientId },
      });

      let secretId: string;
      if (registration?.reportWebhookSecretId) {
        // Update existing Vault secret in place
        const { data, error } = await admin
          .schema("vault")
          .from("secrets")
          .update({ secret: rawSecret })
          .eq("id", registration.reportWebhookSecretId)
          .select("id")
          .single();
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        if (error || !data)
          throw new Error(
            `Failed to update webhook secret: ${String((error as { message?: string } | null)?.message)}`,
          );
        secretId = (data as { id: string }).id;
      } else {
        // Insert new Vault secret
        /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        const { data, error } = await admin
          .schema("vault")
          .from("secrets")
          .insert({ secret: rawSecret, name: `webhook_secret_${clientId}` })
          .select("id")
          .single();
        /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        if (error || !data)
          throw new Error(
            `Failed to store webhook secret: ${String((error as { message?: string } | null)?.message)}`,
          );
        secretId = (data as { id: string }).id;
      }

      await db
        .update(oauthRegistrations)
        .set({ reportWebhookSecretId: secretId })
        .where(eq(oauthRegistrations.clientId, clientId));

      return {
        ...prev,
        webhookSecret: rawSecret,
        reportApiKey: null,
      };
    }

    default:
      throw new Error(`Unknown intent: ${String(intent)}`);
  }
}
