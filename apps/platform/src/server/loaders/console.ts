import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { TestAccount } from "~/server/actions/testAccounts";
import { expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import {
  academicPrograms,
  profiles,
  roles,
  userRoles,
} from "~/server/db/schema";
import {
  getInvolvementFullName,
  getVerificationStatus,
} from "~/server/loaders/verification";
import { testAccountName } from "~/lib/testAccountName";
import { env } from "~/env";
import { logoUrl } from "~/server/oauth/consentScreen";
import { MAX_APPS_PER_MEMBER, type OAuthStatus } from "~/server/oauth/status";
import { supabaseAdmin } from "~/supabase/admin";
import { oauthConsentsInAuth } from "~/supabase/drizzle/schema";

export type AssignedRole = {
  roleId: string;
  roleTitle: string;
  roleColor: string | null;
};

const loadProfilePageUser = () =>
  expectUserWith({
    profile: {
      with: {
        links: { orderBy: (t, { asc }) => asc(t.sortOrder) },
        academicPrograms: {
          with: { program: true },
          orderBy: (t, { asc }) => asc(t.sortOrder),
        },
      },
    },
    githubIdentity: { columns: { identityData: true } },
    discordIdentity: { columns: { identityData: true } },
    linkedinIdentity: { columns: { identityData: true } },
  }).catch(() => redirect("/auth"));

export const getProfilePageData = cache(async () => {
  let user = await loadProfilePageUser();

  // Sign-in creates the profile row (`createUser`). A session without one (a
  // minted test session, or a sign-in that died between the auth user and the
  // profile insert) would crash every field below, so make the row the same
  // way sign-in does and read again.
  if (!user.profile) {
    await db
      .insert(profiles)
      .values({
        userId: user.id,
        preferredName: user.email?.split("@")[0] ?? "DevDogs member",
      })
      .onConflictDoNothing();
    user = await loadProfilePageUser();
  }

  const [, assignedRoleRows, verification, availableAcademicPrograms] =
    await Promise.all([
      !user.profile?.viewedConsole
        ? db
            .update(profiles)
            .set({ viewedConsole: true })
            .where(eq(profiles.userId, user.id))
        : Promise.resolve(),
      db
        .select({
          roleId: userRoles.roleId,
          roleTitle: roles.title,
          roleColor: roles.color,
          isLeadership: roles.isLeadership,
        })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(userRoles.userId, user.id)),
      getVerificationStatus(user.id),
      db
        .select({
          id: academicPrograms.id,
          name: academicPrograms.name,
          credential: academicPrograms.credential,
          category: academicPrograms.category,
        })
        .from(academicPrograms)
        .where(eq(academicPrograms.active, true))
        .orderBy(asc(academicPrograms.name), asc(academicPrograms.credential)),
    ]);

  const assignedRoles: AssignedRole[] = assignedRoleRows.map(
    ({ roleId, roleTitle, roleColor }) => ({ roleId, roleTitle, roleColor }),
  );
  const isLeader = assignedRoleRows.some((r) => r.isLeadership);

  const profile = user.profile;
  const { verificationStatus, isVerified } = verification;
  const involvementFullName = profile ? getInvolvementFullName(profile) : null;

  return {
    ...user,
    userRoles: assignedRoles,
    verificationStatus,
    isVerified,
    involvementFullName,
    isLeader,
    selectedAcademicPrograms:
      profile?.academicPrograms.map(({ program }) => program) ?? [],
    availableAcademicPrograms,
  };
});

export type OAuthClientSummary = {
  clientId: string;
  label: string;
  status: OAuthStatus;
  redirectUris: string[];
  /** The logo's public URL in our own storage, or null (a letter tile shows). */
  logoUrl: string | null;
  homepageUrl: string | null;
  privacyPolicyUrl: string | null;
  /** The test accounts that currently hold an approval of this app. */
  approvedTestAccountIds: string[];
};

/** Public URL of a logo in the avatars bucket, for the settings and console UI. */
export function appLogoUrl(logoPath: string | null): string | null {
  return logoUrl(logoPath, {
    baseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    bucket: env.NEXT_PUBLIC_AVATARS_BUCKET,
  });
}

export const getOAuthPageData = cache(async () => {
  const {
    id: userId,
    githubIdentity,
    testAccounts,
  } = await expectUserWith({
    githubIdentity: { columns: { id: true } },
    testAccounts: {
      columns: { createdAt: true },
      with: {
        user: {
          columns: { id: true, rawUserMetaData: true },
        },
      },
      orderBy: { createdAt: "asc" },
    },
  }).catch(() => redirect("/auth"));

  // Every app this member registered, Testing or In production: they keep
  // managing it after it is published (Q155). DevDogs apps are not theirs.
  const registrations = await db.query.oauthRegistrations.findMany({
    columns: {
      clientId: true,
      label: true,
      status: true,
      logoPath: true,
      homepageUrl: true,
      privacyPolicyUrl: true,
    },
    where: { userId },
    orderBy: { label: "asc" },
  });

  const testAccountIds = testAccounts.map(({ user }) => user.id);
  const approvals =
    registrations.length > 0 && testAccountIds.length > 0
      ? await db
          .select({
            clientId: oauthConsentsInAuth.clientId,
            userId: oauthConsentsInAuth.userId,
          })
          .from(oauthConsentsInAuth)
          .where(
            and(
              inArray(
                oauthConsentsInAuth.clientId,
                registrations.map((r) => r.clientId),
              ),
              inArray(oauthConsentsInAuth.userId, testAccountIds),
              isNull(oauthConsentsInAuth.revokedAt),
            ),
          )
      : [];

  // One OAuth client per project since migration 32 -- fetch each
  // registration's live redirect URIs from the Admin SDK in parallel.
  const clients: OAuthClientSummary[] = await Promise.all(
    registrations.map(async (registration) => {
      const { data } = await supabaseAdmin.auth.admin.oauth.getClient(
        registration.clientId,
      );
      return {
        clientId: registration.clientId,
        label: registration.label,
        status: registration.status,
        redirectUris: data?.redirect_uris ?? [],
        logoUrl: appLogoUrl(registration.logoPath),
        homepageUrl: registration.homepageUrl,
        privacyPolicyUrl: registration.privacyPolicyUrl,
        approvedTestAccountIds: approvals
          .filter((a) => a.clientId === registration.clientId)
          .map((a) => a.userId),
      };
    }),
  );

  const mappedTestAccounts: TestAccount[] = testAccounts.map(
    ({ user, createdAt }) => ({
      userId: user.id,
      displayName: testAccountName(user.rawUserMetaData),
      createdAt: createdAt.toISOString(),
    }),
  );

  return {
    clients,
    appCount: clients.length,
    maxApps: MAX_APPS_PER_MEMBER,
    hasGithub: githubIdentity !== null,
    testAccounts: mappedTestAccounts,
  };
});
