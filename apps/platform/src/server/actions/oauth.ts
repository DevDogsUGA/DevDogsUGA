"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { authenticate, expectUserWith } from "../auth";
import { db } from "../db";
import {
  auditEvents,
  moderationClients,
  oauthRegistrations,
} from "../db/schema";
import { supabaseAdmin } from "../../supabase/admin";
import { oauthAuditEvent } from "../oauth/audit";
import {
  cleanUpTestAccountsIfNoClientsRemain,
  deleteSupabaseClient,
} from "../oauth/ownedClients";
import { createOauthClientAndRegister } from "../oauth/registerClient";
import {
  parseTier,
  productionRedirectUriError,
  type OAuthTier,
} from "../oauth/tier";
import { canUserManageOAuthApps } from "./permissions";

const MAX_REDIRECT_URIS = 5;
const MAX_LABEL_LENGTH = 100;
/** More than DevDogs has apps; a ceiling so a bug cannot mint hundreds. */
const MAX_PRODUCTION_CLIENTS = 10;

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
 * A development client belongs to whoever registered it. A production client
 * is managed by everyone who holds `canManageOAuthApps`, wherever it came
 * from. Anyone else gets the same "not found" as for a client that does not
 * exist, so the answer never says which ids are real.
 */
async function requireManagedClient(userId: string, clientId: string) {
  const registration = await db.query.oauthRegistrations.findFirst({
    columns: { clientId: true, userId: true, tier: true, label: true },
    where: { clientId },
  });
  if (!registration) throw new Error(NOT_FOUND);

  const allowed =
    registration.tier === "production"
      ? await canUserManageOAuthApps(userId)
      : registration.userId === userId;
  if (!allowed) throw new Error(NOT_FOUND);

  return registration;
}

/** True when GoTrue still has the client (a deleted one is soft-deleted). */
async function clientIsLive(clientId: string): Promise<boolean> {
  const { data, error } =
    await supabaseAdmin.auth.admin.oauth.getClient(clientId);
  return !error && data !== null;
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
 * Runs a change to a client in GoTrue and, for a production client, records its
 * audit entry in the same transaction.
 *
 * The entry is written first and the GoTrue call runs inside the transaction,
 * so the two cannot disagree: a failed audit insert means GoTrue is never
 * touched (a secret is never rolled without a record), and a GoTrue failure
 * rolls the entry back (nothing is recorded for a change that did not happen).
 * `change` must throw on failure; it reports its result through its return.
 */
async function changeClient<T>(
  tier: OAuthTier,
  audit: Parameters<typeof oauthAuditEvent>[0],
  change: () => Promise<T>,
): Promise<T> {
  if (tier !== "production") return change();
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
 * Development clients are a member's own, one per project (migration 32); the
 * one-click `devtools oauth` connect flow (`~/server/actions/oauthConnect.ts`)
 * mints them the same way without a form round trip. Production clients are
 * the credentials DevDogs apps sign members in with: only a holder of
 * `canManageOAuthApps` creates or manages them, every change is audited, and
 * one cannot be deleted until another live production client can take over.
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
      const tier: OAuthTier =
        parseTier(formText(formData, "tier")) ?? "development";

      const label = formText(formData, "label");
      if (!label) throw new Error("Label is required");
      if (label.length > MAX_LABEL_LENGTH) {
        throw new Error(
          `Label must be ${MAX_LABEL_LENGTH} characters or fewer`,
        );
      }

      if (tier === "production") {
        // Checked first and refused flatly: a member without the permission
        // learns nothing about what a production client needs.
        if (!(await canUserManageOAuthApps(user.id))) {
          throw new Error("Not authorized: canManageOAuthApps required");
        }

        const callbackUri = formText(formData, "callbackUri");
        const problem = productionRedirectUriError(callbackUri);
        if (problem) throw new Error(problem);

        const [existing] = await db
          .select({ value: count() })
          .from(oauthRegistrations)
          .where(eq(oauthRegistrations.tier, "production"));
        if ((existing?.value ?? 0) >= MAX_PRODUCTION_CLIENTS) {
          throw new Error(
            `A maximum of ${MAX_PRODUCTION_CLIENTS} production clients are allowed`,
          );
        }

        const created = await createOauthClientAndRegister({
          label,
          redirectUris: [callbackUri],
          userId: user.id,
          tier,
        });
        return {
          clientId: created.clientId,
          clientSecret: created.clientSecret,
        };
      }

      if (!user.githubIdentity) {
        throw new Error(
          "A linked GitHub account is required to create an OAuth client",
        );
      }

      const created = await createOauthClientAndRegister({
        label,
        redirectUris: DEFAULT_REDIRECT_URIS,
        userId: user.id,
        tier,
      });
      return { clientId: created.clientId, clientSecret: created.clientSecret };
    }

    case "revoke-client": {
      const clientId = formText(formData, "clientId");
      const registration = await requireManagedClient(user.id, clientId);

      if (registration.tier === "production") {
        // Replacement before delete: sign-in must never be left without a
        // production client. The replacement has to be another, live, production
        // client, and the audit entry names it.
        const replacementClientId = formText(formData, "replacementClientId");
        if (!replacementClientId || replacementClientId === clientId) {
          throw new Error(
            "Pick another production client to replace this one before deleting it",
          );
        }
        await db.transaction(async (tx) => {
          // Two officers deleting each other's client at the same moment must
          // not both pass the replacement check and leave none: serialise
          // production deletions, and check the replacement under the lock.
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext('platform.oauth.production-clients'))`,
          );

          const [replacement] = await tx
            .select({
              clientId: oauthRegistrations.clientId,
              label: oauthRegistrations.label,
            })
            .from(oauthRegistrations)
            .where(
              and(
                eq(oauthRegistrations.clientId, replacementClientId),
                eq(oauthRegistrations.tier, "production"),
              ),
            )
            .limit(1);
          if (!replacement || !(await clientIsLive(replacement.clientId))) {
            throw new Error(
              "The replacement must be another live production client",
            );
          }

          // The deleted client's moderation registration (the external app it
          // reports for and where decisions go) passes to the replacement.
          // Read here without locking the row: GoTrue's soft delete, below,
          // fires a trigger that drops it in GoTrue's own transaction, and a
          // lock held by this one would make the two wait on each other.
          const [registered] = await tx
            .select({
              appId: moderationClients.appId,
              endpointUrl: moderationClients.endpointUrl,
            })
            .from(moderationClients)
            .where(eq(moderationClients.clientId, clientId));

          // Supabase first: if it fails the transaction rolls back and the
          // registration is still here, so the delete can be retried instead
          // of leaving a live client with no owner.
          await deleteSupabaseClient(clientId);
          await tx
            .delete(oauthRegistrations)
            .where(eq(oauthRegistrations.clientId, clientId));

          let moderation = "none";
          if (registered) {
            // The replacement keeps a registration of its own if it has one;
            // otherwise it takes over this one. Its signing secret is derived
            // from its own id, so the app needs the new secret from
            // /tools/oauth either way.
            const inserted = await tx
              .insert(moderationClients)
              .values({
                clientId: replacement.clientId,
                appId: registered.appId,
                endpointUrl: registered.endpointUrl,
              })
              .onConflictDoNothing()
              .returning({ clientId: moderationClients.clientId });
            moderation = inserted.length > 0 ? "transferred" : "dropped";
          }
          await tx.insert(auditEvents).values(
            oauthAuditEvent({
              actorUserId: user.id,
              action: "oauth_client.deleted",
              clientId,
              metadata: {
                label: registration.label,
                replacementClientId: replacement.clientId,
                replacementLabel: replacement.label,
                moderation,
              },
            }),
          );
        });
        return EMPTY_STATE;
      }

      // Same order for a development client: the Supabase client goes first
      // (the registration's foreign key does not cascade, because GoTrue only
      // soft-deletes), then the registration.
      await deleteSupabaseClient(clientId);
      await db
        .delete(oauthRegistrations)
        .where(
          and(
            eq(oauthRegistrations.clientId, clientId),
            eq(oauthRegistrations.userId, user.id),
          ),
        );
      await cleanUpTestAccountsIfNoClientsRemain(user.id);

      return EMPTY_STATE;
    }

    case "reset-secret": {
      const clientId = formText(formData, "clientId");
      const registration = await requireManagedClient(user.id, clientId);

      const secret = await changeClient(
        registration.tier,
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

      let parsed: URL;
      try {
        parsed = new URL(uri);
      } catch {
        throw new Error("Invalid URL");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Redirect URIs must use http:// or https://");
      }
      if (registration.tier === "production") {
        const problem = productionRedirectUriError(uri);
        if (problem) throw new Error(problem);
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
      await changeClient(
        registration.tier,
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
      if (registration.tier === "production" && updated.length === 0) {
        throw new Error("A production client needs at least one redirect URI");
      }
      await changeClient(
        registration.tier,
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
