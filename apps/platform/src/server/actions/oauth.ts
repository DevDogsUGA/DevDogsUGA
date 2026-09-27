"use server";

import { and, eq } from "drizzle-orm";
import { authenticate, expectUserWith } from "../auth";
import { db } from "../db";
import { oauthRegistrations, oauthTestAccounts } from "../db/schema";
import { supabaseAdmin } from "../../supabase/admin";

const MAX_REDIRECT_URIS = 5;
const MAX_LABEL_LENGTH = 100;

const DEFAULT_REDIRECT_URIS = [
  "http://localhost:3000/auth", // Community Resource Forum
];

export type OAuthState = {
  /** The client the most recent dispatch minted or reset a secret for. */
  clientId: string | null;
  /** Shown once, then gone: neither Supabase nor this table can recover it. */
  clientSecret: string | null;
};

const EMPTY_STATE: OAuthState = { clientId: null, clientSecret: null };

/**
 * Deletes every test account this user owns and their backing `auth.users`
 * rows, once they hold zero OAuth clients (test accounts exist only to sign
 * into somebody's client).
 */
async function cleanUpTestAccountsIfNoClientsRemain(
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

  await db
    .delete(oauthTestAccounts)
    .where(eq(oauthTestAccounts.ownerUserId, userId));
  await Promise.all(
    testAccounts.map(({ testUserId }) =>
      supabaseAdmin.auth.admin.deleteUser(testUserId),
    ),
  );
}

/**
 * `/tools/oauth`'s manual client management: one OAuth client per project,
 * not per member (migration 32). The one-click `devtools oauth` connect flow
 * (`~/server/actions/oauthConnect.ts`) mints clients the same way but without
 * a form round trip; this action is what still lets someone create, inspect,
 * and revoke a client by hand.
 */
export default async function oauthAction(
  _prev: OAuthState,
  formData: FormData,
): Promise<OAuthState> {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const intent = formData.get("intent")?.toString();

  const user = await expectUserWith({
    githubIdentity: { columns: { id: true } },
  }).catch(() => authenticate("google", "/tools/oauth"));

  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (intent) {
    case "create-client": {
      if (!user.githubIdentity) {
        throw new Error(
          "A linked GitHub account is required to create an OAuth client",
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const label = formData.get("label")?.toString().trim() ?? "";
      if (!label) throw new Error("Label is required");
      if (label.length > MAX_LABEL_LENGTH) {
        throw new Error(
          `Label must be ${MAX_LABEL_LENGTH} characters or fewer`,
        );
      }

      const { data, error } = await supabaseAdmin.auth.admin.oauth.createClient(
        {
          client_name: label,
          redirect_uris: DEFAULT_REDIRECT_URIS,
          scope: "openid email profile",
        },
      );

      if (error ?? !data) throw new Error("Failed to create OAuth client");

      await db
        .insert(oauthRegistrations)
        .values({ userId: user.id, clientId: data.client_id, label });

      return {
        clientId: data.client_id,
        clientSecret: data.client_secret ?? null,
      };
    }

    case "revoke-client": {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const clientId = formData.get("clientId")?.toString() ?? "";

      const owned = await db.query.oauthRegistrations.findFirst({
        columns: { clientId: true },
        where: { clientId, userId: user.id },
      });
      if (!owned) throw new Error("OAuth client not found");

      // Fetch test-account ids before deleting so the auth.users cleanup
      // below still has them, same reasoning as the old toggle-client path.
      await db
        .delete(oauthRegistrations)
        .where(
          and(
            eq(oauthRegistrations.clientId, clientId),
            eq(oauthRegistrations.userId, user.id),
          ),
        );
      await supabaseAdmin.auth.admin.oauth.deleteClient(clientId);
      await cleanUpTestAccountsIfNoClientsRemain(user.id);

      return EMPTY_STATE;
    }

    case "reset-secret": {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const clientId = formData.get("clientId")?.toString() ?? "";

      const owned = await db.query.oauthRegistrations.findFirst({
        columns: { clientId: true },
        where: { clientId, userId: user.id },
      });
      if (!owned) throw new Error("OAuth client not found");

      const { data, error } =
        await supabaseAdmin.auth.admin.oauth.regenerateClientSecret(clientId);
      if (error || !data)
        throw new Error(
          `Failed to regenerate client secret: ${error?.message}`,
        );

      return { clientId, clientSecret: data.client_secret ?? null };
    }

    case "add-uri": {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const clientId = formData.get("clientId")?.toString() ?? "";
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const uri = formData.get("uri")?.toString().trim() ?? "";

      const owned = await db.query.oauthRegistrations.findFirst({
        columns: { clientId: true },
        where: { clientId, userId: user.id },
      });
      if (!owned) throw new Error("OAuth client not found");

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

      if (existing.redirect_uris.includes(uri)) return EMPTY_STATE;

      if (existing.redirect_uris.length >= MAX_REDIRECT_URIS) {
        throw new Error(
          `A maximum of ${MAX_REDIRECT_URIS} redirect URIs are allowed`,
        );
      }

      const updated = [...existing.redirect_uris, uri];
      await supabaseAdmin.auth.admin.oauth.updateClient(clientId, {
        redirect_uris: updated,
      });
      return EMPTY_STATE;
    }

    case "remove-uri": {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const clientId = formData.get("clientId")?.toString() ?? "";
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const uri = formData.get("uri")?.toString().trim() ?? "";

      const owned = await db.query.oauthRegistrations.findFirst({
        columns: { clientId: true },
        where: { clientId, userId: user.id },
      });
      if (!owned) throw new Error("OAuth client not found");

      const { data: existing, error: getError } =
        await supabaseAdmin.auth.admin.oauth.getClient(clientId);
      if (getError || !existing)
        throw new Error(`Failed to fetch OAuth client: ${getError?.message}`);

      const updated = existing.redirect_uris.filter((u) => u !== uri);
      await supabaseAdmin.auth.admin.oauth.updateClient(clientId, {
        redirect_uris: updated,
      });
      return EMPTY_STATE;
    }

    default:
      throw new Error(`Unknown intent: ${String(intent)}`);
  }
}
