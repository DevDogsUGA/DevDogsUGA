"use server";

import { eq } from "drizzle-orm";
import { authenticate, expectUserWith } from "../auth";
import { db } from "../db";
import { auditEvents, oauthRegistrations } from "../db/schema";
import { supabaseAdmin } from "../../supabase/admin";
import { revokeAppAccess } from "../oauth/appStatus";
import { oauthAuditEvent } from "../oauth/audit";
import {
  cleanUpTestAccountsIfNoClientsRemain,
  deleteSupabaseClient,
} from "../oauth/ownedClients";
import { createOauthClientAndRegister } from "../oauth/registerClient";
import { redirectUriError } from "../oauth/redirectRule";
import { canUserManageOAuthApps } from "./permissions";

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

const NOT_FOUND = "OAuth client not found";

/**
 * The registration of a client the caller may manage, or a "not found" error.
 *
 * An app belongs to whoever registered it, published or not (they keep its
 * redirects, secret and label, Q155). A DevDogs app has no owner, so everyone
 * who holds `canManageOAuthApps` manages it. Anyone else gets the same "not
 * found" as for a client that does not exist, so the answer never says which
 * ids are real.
 */
async function requireManagedClient(userId: string, clientId: string) {
  const registration = await db.query.oauthRegistrations.findFirst({
    columns: { clientId: true, userId: true, status: true, label: true },
    where: { clientId },
  });
  if (!registration) throw new Error(NOT_FOUND);

  const allowed =
    registration.userId === null
      ? await canUserManageOAuthApps(userId)
      : registration.userId === userId;
  if (!allowed) throw new Error(NOT_FOUND);

  return {
    ...registration,
    /** In production or ownerless: real members sign in with it. */
    audited:
      registration.userId === null || registration.status === "in_production",
  };
}

/** Replaces a client's redirect URIs; a rejected update is an error, not a no-op. */
async function updateRedirectUris(
  clientId: string,
  redirectUris: string[],
): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.oauth.updateClient(
    clientId,
    { redirect_uris: redirectUris },
  );
  if (error) {
    throw new Error(`Failed to update OAuth client: ${error.message}`);
  }
}

/**
 * Runs a change to a client in GoTrue and, for an audited app (In production
 * or a DevDogs app), records its audit entry in the same transaction.
 *
 * The entry is written first and the GoTrue call runs inside the transaction,
 * so the two cannot disagree: a failed audit insert means GoTrue is never
 * touched (a secret is never rolled without a record), and a GoTrue failure
 * rolls the entry back (nothing is recorded for a change that did not happen).
 * `change` must throw on failure; it reports its result through its return.
 */
async function changeClient<T>(
  audited: boolean,
  audit: Parameters<typeof oauthAuditEvent>[0],
  change: () => Promise<T>,
): Promise<T> {
  if (!audited) return change();
  return db.transaction(async (tx) => {
    await tx.insert(auditEvents).values(oauthAuditEvent(audit));
    return change();
  });
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `/tools/oauth`'s manual client management.
 *
 * Every client a member creates is their own Testing app that asks for consent
 * (one per project, migration 32; the one-click `devtools oauth` connect flow,
 * `~/server/actions/oauthConnect.ts`, mints them the same way). A member owns
 * at most three. Publishing, transferring to DevDogs and the consent switch are
 * holder-only and live in `./oauthStatus.ts`; this file keeps the owner's
 * credentials: create, delete, secret, redirects.
 */
export default async function oauthAction(
  _prev: OAuthState,
  formData: FormData,
): Promise<OAuthState> {
  const intent = formText(formData, "intent");

  const user = await expectUserWith({
    githubIdentity: { columns: { id: true } },
  }).catch(() => authenticate("google", "/settings/oauth"));

  switch (intent) {
    case "create-client": {
      const label = formText(formData, "label");
      if (!label) throw new Error("Label is required");
      if (label.length > MAX_LABEL_LENGTH) {
        throw new Error(
          `Label must be ${MAX_LABEL_LENGTH} characters or fewer`,
        );
      }

      if (!user.githubIdentity) {
        throw new Error(
          "A linked GitHub account is required to create an OAuth client",
        );
      }

      // An address typed into the form is checked by the same rule as every
      // other redirect; without one the client gets the default.
      const callbackUri = formText(formData, "callbackUri");
      const redirectUris = callbackUri ? [callbackUri] : DEFAULT_REDIRECT_URIS;

      const created = await createOauthClientAndRegister({
        label,
        redirectUris,
        userId: user.id,
      });
      return { clientId: created.clientId, clientSecret: created.clientSecret };
    }

    case "revoke-client": {
      const clientId = formText(formData, "clientId");
      const registration = await requireManagedClient(user.id, clientId);

      // Whoever signed in with the app stops being signed in, then the
      // Supabase client goes (the registration's foreign key does not cascade,
      // because GoTrue only soft-deletes), then the registration. The audit
      // entry is written with the delete so an audited app is never removed
      // without one.
      await db.transaction(async (tx) => {
        const revoked = await revokeAppAccess(
          tx,
          clientId,
          "everyone_but_owner",
        );
        if (registration.audited) {
          await tx.insert(auditEvents).values(
            oauthAuditEvent({
              actorUserId: user.id,
              action: "oauth_client.deleted",
              clientId,
              metadata: { label: registration.label, ...revoked },
            }),
          );
        }
        await deleteSupabaseClient(clientId);
        await tx
          .delete(oauthRegistrations)
          .where(eq(oauthRegistrations.clientId, clientId));
      });
      await cleanUpTestAccountsIfNoClientsRemain(user.id);

      return EMPTY_STATE;
    }

    case "reset-secret": {
      const clientId = formText(formData, "clientId");
      const registration = await requireManagedClient(user.id, clientId);

      const secret = await changeClient(
        registration.audited,
        {
          actorUserId: user.id,
          action: "oauth_client.secret_rotated",
          clientId,
          metadata: { label: registration.label },
        },
        async () => {
          const { data, error } =
            await supabaseAdmin.auth.admin.oauth.regenerateClientSecret(
              clientId,
            );
          if (error || !data) {
            throw new Error(
              `Failed to regenerate client secret: ${error?.message}`,
            );
          }
          return data.client_secret ?? null;
        },
      );

      return { clientId, clientSecret: secret };
    }

    case "add-uri": {
      const clientId = formText(formData, "clientId");
      const uri = formText(formData, "uri");
      const registration = await requireManagedClient(user.id, clientId);

      const problem = redirectUriError(uri);
      if (problem) throw new Error(problem);

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
      await changeClient(
        registration.audited,
        {
          actorUserId: user.id,
          action: "oauth_client.redirect_uri_added",
          clientId,
          metadata: { label: registration.label, redirectUri: uri },
        },
        () => updateRedirectUris(clientId, updated),
      );
      return EMPTY_STATE;
    }

    case "remove-uri": {
      const clientId = formText(formData, "clientId");
      const uri = formText(formData, "uri");
      const registration = await requireManagedClient(user.id, clientId);

      const { data: existing, error: getError } =
        await supabaseAdmin.auth.admin.oauth.getClient(clientId);
      if (getError || !existing)
        throw new Error(`Failed to fetch OAuth client: ${getError?.message}`);

      const updated = existing.redirect_uris.filter((u) => u !== uri);
      if (updated.length === 0) {
        throw new Error("An app needs at least one redirect URI");
      }
      await changeClient(
        registration.audited,
        {
          actorUserId: user.id,
          action: "oauth_client.redirect_uri_removed",
          clientId,
          metadata: { label: registration.label, redirectUri: uri },
        },
        () => updateRedirectUris(clientId, updated),
      );
      return EMPTY_STATE;
    }

    default:
      throw new Error(`Unknown intent: ${String(intent)}`);
  }
}
