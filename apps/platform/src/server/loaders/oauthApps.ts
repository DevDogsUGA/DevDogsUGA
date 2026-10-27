import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "~/server/db";
import { oauthRegistrations } from "~/server/db/schema";
import { expectSession } from "~/server/auth";
import { appLogoUrl } from "~/server/loaders/console";
import { missingForPublishing } from "~/server/oauth/appStatus";
import type { OAuthStatus } from "~/server/oauth/status";
import { supabaseAdmin } from "~/supabase/admin";
import { oauthConsentsInAuth } from "~/supabase/drizzle/schema";

export interface ConnectedApp {
  clientId: string;
  label: string;
  logoUrl: string | null;
  homepageUrl: string | null;
  /** When the member approved it (ISO). */
  approvedAt: string;
}

/**
 * Every app the signed-in member has approved and not removed
 * (`auth.oauth_consents` with no `revoked_at`), newest approval first.
 */
export async function getConnectedApps(): Promise<ConnectedApp[]> {
  const userId = await expectSession();
  const rows = await db
    .select({
      clientId: oauthRegistrations.clientId,
      label: oauthRegistrations.label,
      logoPath: oauthRegistrations.logoPath,
      homepageUrl: oauthRegistrations.homepageUrl,
      approvedAt: oauthConsentsInAuth.grantedAt,
    })
    .from(oauthConsentsInAuth)
    .innerJoin(
      oauthRegistrations,
      eq(oauthRegistrations.clientId, oauthConsentsInAuth.clientId),
    )
    .where(
      and(
        eq(oauthConsentsInAuth.userId, userId),
        isNull(oauthConsentsInAuth.revokedAt),
      ),
    )
    .orderBy(desc(oauthConsentsInAuth.grantedAt));
  return rows.map((row) => ({
    clientId: row.clientId,
    label: row.label,
    logoUrl: appLogoUrl(row.logoPath),
    homepageUrl: row.homepageUrl,
    approvedAt: row.approvedAt.toISOString(),
  }));
}

export interface ConsoleApp {
  clientId: string;
  label: string;
  status: OAuthStatus;
  /** The registering member's preferred name; null for a DevDogs app. */
  ownerName: string | null;
  isDevDogs: boolean;
  asksForConsent: boolean;
  logoUrl: string | null;
  homepageUrl: string | null;
  privacyPolicyUrl: string | null;
  /** Live redirect URIs; read only for DevDogs apps, which holders edit here. */
  redirectUris: string[];
  /** What publishing still needs ("a logo", ...); empty when it may go live. */
  missing: string[];
  /** Members holding an approval now: who a return to Testing signs out. */
  approvedMembers: number;
}

/**
 * The apps Console → Apps lists: DevDogs apps (no owner), members' apps that
 * are In production, and members' Testing apps (a holder publishes or
 * transfers one from here; there is no request flow, Q155). DevDogs apps first,
 * then In production, then Testing. The caller must already hold
 * `canManageOAuthApps`.
 */
export async function getConsoleApps(): Promise<ConsoleApp[]> {
  const registrations = await db.query.oauthRegistrations.findMany({
    columns: {
      clientId: true,
      userId: true,
      label: true,
      status: true,
      asksForConsent: true,
      logoPath: true,
      homepageUrl: true,
      privacyPolicyUrl: true,
    },
    with: { profile: { columns: { preferredName: true } } },
    orderBy: { label: "asc" },
  });
  if (registrations.length === 0) return [];

  const counts = await db
    .select({ clientId: oauthConsentsInAuth.clientId, value: count() })
    .from(oauthConsentsInAuth)
    .where(
      and(
        inArray(
          oauthConsentsInAuth.clientId,
          registrations.map((r) => r.clientId),
        ),
        isNull(oauthConsentsInAuth.revokedAt),
      ),
    )
    .groupBy(oauthConsentsInAuth.clientId);

  // Holders edit a DevDogs app's redirects here, so those are read live.
  const redirects = new Map<string, string[]>();
  await Promise.all(
    registrations
      .filter((r) => r.userId === null)
      .map(async (r) => {
        const { data } = await supabaseAdmin.auth.admin.oauth.getClient(
          r.clientId,
        );
        redirects.set(r.clientId, data?.redirect_uris ?? []);
      }),
  );

  const rank = (r: (typeof registrations)[number]) =>
    r.userId === null ? 0 : r.status === "in_production" ? 1 : 2;
  const ordered = [...registrations].sort((a, b) => rank(a) - rank(b));

  return ordered.map((r) => ({
    clientId: r.clientId,
    label: r.label,
    status: r.status,
    ownerName: r.profile?.preferredName ?? null,
    isDevDogs: r.userId === null,
    asksForConsent: r.asksForConsent,
    logoUrl: appLogoUrl(r.logoPath),
    homepageUrl: r.homepageUrl,
    privacyPolicyUrl: r.privacyPolicyUrl,
    redirectUris: redirects.get(r.clientId) ?? [],
    missing: missingForPublishing(r),
    approvedMembers: counts.find((c) => c.clientId === r.clientId)?.value ?? 0,
  }));
}
