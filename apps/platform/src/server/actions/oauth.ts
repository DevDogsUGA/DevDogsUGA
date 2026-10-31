"use server";

import {
  expected,
  ExpectedFailure,
  type ActionResult,
} from "~/lib/actionResult";
import { authorizeSession, callerFor } from "~/server/auth/access";

import { eq } from "drizzle-orm";
import { authenticate, expectUserWith } from "../auth";
import { db } from "../db";
import { auditEvents, oauthRegistrations } from "../db/schema";
import { supabaseAdmin } from "../../supabase/admin";
import { revokeAppAccess } from "../oauth/appStatus";
import { oauthAuditEvent } from "../oauth/audit";
import { mayManageClient } from "../oauth/managedClient";
import {
  cleanUpTestAccountsIfNoClientsRemain,
  deleteSupabaseClient,
} from "../oauth/ownedClients";
import { createOauthClientAndRegister } from "../oauth/registerClient";
import { redirectUriError } from "../oauth/redirectRule";

const MAX_REDIRECT_URIS = 5;
const MAX_LABEL_LENGTH = 100;

const DEFAULT_REDIRECT_URIS = [
  "http://localhost:3000/auth", // Community Resource Forum
];

const NOT_FOUND = "OAuth client not found";

/**
 * The registration of a client the caller may manage, or a "not found" refusal.
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
  if (!registration) throw new ExpectedFailure(NOT_FOUND);

  if (!mayManageClient(registration, await callerFor(userId)))
    throw new ExpectedFailure(NOT_FOUND);

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

/** The signed-in member, or the sign-in redirect. Every action here needs one. */
async function signedInMember() {
  const access = await authorizeSession();
  if (!access.ok) return authenticate("google", "/dashboard/oauth");
  return expectUserWith({
    githubIdentity: { columns: { id: true } },
  }).catch(() => authenticate("google", "/dashboard/oauth"));
}

/**
 * `/dashboard/oauth`'s manual client management, one Command per change.
 *
 * Every client a member creates is their own Testing app that asks for consent
 * (one per project, migration 32; the one-click `devtools oauth` connect flow,
 * `~/server/actions/oauthConnect.ts`, mints them the same way). A member owns
 * at most three. Publishing, transferring to DevDogs and the consent switch are
 * holder-only and live in `./oauthStatus.ts`; this file keeps the owner's
 * credentials: create, delete, secret, redirects. A refusal the member can
 * cause (a missing label, a rejected address, the app cap, an app that is not
 * theirs) comes back as a failure; GoTrue refusing a change still throws.
 */

/** What creating an app returns: its id and the secret, which is shown once. */
export interface CreatedClient {
  clientId: string;
  /** Shown once, then gone: neither Supabase nor this table can recover it. */
  clientSecret: string;
}

/** Creates the member's own Testing app from the new-app form. */
export async function createOAuthClient(
  formData: FormData,
): Promise<ActionResult<CreatedClient>> {
  const user = await signedInMember();
  const label = formText(formData, "label");

  return expected(async () => {
    if (!label) throw new ExpectedFailure("Label is required");
    if (label.length > MAX_LABEL_LENGTH) {
      throw new ExpectedFailure(
        `Label must be ${MAX_LABEL_LENGTH} characters or fewer`,
      );
    }

    if (!user.githubIdentity) {
      throw new ExpectedFailure(
        "A linked GitHub account is required to create an OAuth client",
      );
    }

    // An address typed into the form is checked by the same rule as every
    // other redirect; without one the client gets the default.
    const callbackUri = formText(formData, "callbackUri");
    const redirectUris = callbackUri ? [callbackUri] : DEFAULT_REDIRECT_URIS;

    return createOauthClientAndRegister({
      label,
      redirectUris,
      userId: user.id,
    });
  }, `Created ${label}.`);
}

/**
 * Deletes an app the member manages. Whoever signed in with the app stops being
 * signed in, then the Supabase client goes (the registration's foreign key does
 * not cascade, because GoTrue only soft-deletes), then the registration. The
 * audit entry is written with the delete so an audited app is never removed
 * without one.
 */
export async function deleteOAuthClient(
  clientId: string,
): Promise<ActionResult> {
  const user = await signedInMember();

  return expected(async (): Promise<undefined> => {
    const registration = await requireManagedClient(user.id, clientId);

    await db.transaction(async (tx) => {
      const revoked = await revokeAppAccess(tx, clientId, "everyone_but_owner");
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
  }, "App deleted.");
}

/** Rolls an app's secret. The new one comes back in `data`, to be shown once. */
export async function regenerateOAuthSecret(
  clientId: string,
): Promise<ActionResult<{ clientSecret: string | null }>> {
  const user = await signedInMember();

  return expected(async () => {
    const registration = await requireManagedClient(user.id, clientId);

    const clientSecret = await changeClient(
      registration.audited,
      {
        actorUserId: user.id,
        action: "oauth_client.secret_rotated",
        clientId,
        metadata: { label: registration.label },
      },
      async () => {
        const { data, error } =
          await supabaseAdmin.auth.admin.oauth.regenerateClientSecret(clientId);
        if (error || !data) {
          throw new Error(
            `Failed to regenerate client secret: ${error?.message}`,
          );
        }
        return data.client_secret ?? null;
      },
    );

    return { clientSecret };
  }, "Secret regenerated.");
}

/** Adds a redirect URI to an app, under the one redirect rule and the five-address cap. */
export async function addRedirectUri(
  clientId: string,
  rawUri: string,
): Promise<ActionResult> {
  const user = await signedInMember();
  const uri = rawUri.trim();

  return expected(async (): Promise<undefined> => {
    const registration = await requireManagedClient(user.id, clientId);

    const problem = redirectUriError(uri);
    if (problem) throw new ExpectedFailure(problem);

    const { data: existing, error: getError } =
      await supabaseAdmin.auth.admin.oauth.getClient(clientId);
    if (getError || !existing)
      throw new Error(`Failed to fetch OAuth client: ${getError?.message}`);

    if (existing.redirect_uris.includes(uri)) return;

    if (existing.redirect_uris.length >= MAX_REDIRECT_URIS) {
      throw new ExpectedFailure(
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
  }, "Redirect URI added.");
}

/** Removes a redirect URI from an app; an app keeps at least one. */
export async function removeRedirectUri(
  clientId: string,
  rawUri: string,
): Promise<ActionResult> {
  const user = await signedInMember();
  const uri = rawUri.trim();

  return expected(async (): Promise<undefined> => {
    const registration = await requireManagedClient(user.id, clientId);

    const { data: existing, error: getError } =
      await supabaseAdmin.auth.admin.oauth.getClient(clientId);
    if (getError || !existing)
      throw new Error(`Failed to fetch OAuth client: ${getError?.message}`);

    const updated = existing.redirect_uris.filter((u) => u !== uri);
    if (updated.length === 0) {
      throw new ExpectedFailure("An app needs at least one redirect URI");
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
  }, "Redirect URI removed.");
}
