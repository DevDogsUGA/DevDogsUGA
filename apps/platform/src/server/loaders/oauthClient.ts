import { and, eq, inArray, isNull } from "drizzle-orm";
import { cache } from "react";
import * as z from "zod";
import { loadCaller } from "~/server/auth/access";
import { db } from "~/server/db";
import { appLogoUrl, type OAuthClientSummary } from "~/server/loaders/console";
import {
  getClientModeration,
  type ClientModeration,
} from "~/server/loaders/oauthModeration";
import { mayManageClient } from "~/server/oauth/managedClient";
import { testAccountName } from "~/lib/testAccountName";
import type { TestAccount } from "~/server/actions/testAccounts";
import { supabaseAdmin } from "~/supabase/admin";
import { oauthConsentsInAuth } from "~/supabase/drizzle/schema";

export interface OAuthClientPage {
  client: OAuthClientSummary;
  /** An officer is editing a DevDogs app: no owner, so no test accounts. */
  devDogsApp: boolean;
  /** The member's test accounts; empty for a DevDogs app. */
  testAccounts: TestAccount[];
  moderation: ClientModeration;
}

const uuid = z.uuid();

/**
 * Everything one client's page shows, or null when the caller may not manage
 * it: the Record rule (`mayManageClient`) is the same one the actions apply, so
 * a client someone else owns reads as one that does not exist.
 */
export const getOAuthClientPage = cache(
  async (clientId: string): Promise<OAuthClientPage | null> => {
    if (!uuid.safeParse(clientId).success) return null;
    const caller = await loadCaller();
    if (!caller) return null;

    const registration = await db.query.oauthRegistrations.findFirst({
      columns: {
        clientId: true,
        userId: true,
        label: true,
        status: true,
        logoPath: true,
        homepageUrl: true,
        privacyPolicyUrl: true,
      },
      where: { clientId },
    });
    if (!registration || !mayManageClient(registration, caller)) return null;

    const devDogsApp = registration.userId === null;
    const [{ data }, testAccountRows] = await Promise.all([
      supabaseAdmin.auth.admin.oauth.getClient(clientId),
      devDogsApp
        ? []
        : db.query.oauthTestAccounts.findMany({
            columns: { createdAt: true },
            with: {
              user: { columns: { id: true, rawUserMetaData: true } },
            },
            where: { ownerUserId: caller.userId },
            orderBy: { createdAt: "asc" },
          }),
    ]);

    const testAccounts: TestAccount[] = testAccountRows.map(
      ({ user, createdAt }) => ({
        userId: user.id,
        displayName: testAccountName(user.rawUserMetaData),
        createdAt: createdAt.toISOString(),
      }),
    );
    const approvals =
      testAccounts.length > 0
        ? await db
            .select({ userId: oauthConsentsInAuth.userId })
            .from(oauthConsentsInAuth)
            .where(
              and(
                eq(oauthConsentsInAuth.clientId, clientId),
                inArray(
                  oauthConsentsInAuth.userId,
                  testAccounts.map((a) => a.userId),
                ),
                isNull(oauthConsentsInAuth.revokedAt),
              ),
            )
        : [];

    return {
      client: {
        clientId,
        label: registration.label,
        status: registration.status,
        redirectUris: data?.redirect_uris ?? [],
        logoUrl: appLogoUrl(registration.logoPath),
        homepageUrl: registration.homepageUrl,
        privacyPolicyUrl: registration.privacyPolicyUrl,
        approvedTestAccountIds: approvals.map((a) => a.userId),
      },
      devDogsApp,
      testAccounts,
      moderation: await getClientModeration({
        clientId,
        label: registration.label,
        production: devDogsApp || registration.status === "in_production",
      }),
    };
  },
);
