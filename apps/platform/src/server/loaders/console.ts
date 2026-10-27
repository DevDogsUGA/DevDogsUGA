import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { TestAccount } from "~/server/actions/testAccounts";
import { canUserManageOAuthApps } from "~/server/actions/permissions";
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
import { supabaseAdmin } from "~/supabase/admin";

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
  redirectUris: string[];
  /** The registering member's preferred name; set for production clients. */
  ownerName: string | null;
};

export const getOAuthPageData = cache(async () => {
  const {
    id: userId,
    profile,
    githubIdentity,
    testAccounts,
  } = await expectUserWith({
    profile: {
      with: {
        // Testing apps only: an app that is In production is listed below,
        // for whoever holds `canManageOAuthApps`, whoever registered it.
        oauthRegistrations: {
          columns: { clientId: true, label: true },
          where: { status: "testing" },
        },
      },
    },
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

  const canManageOAuthApps = await canUserManageOAuthApps(userId);

  const summarise = async (
    clientId: string,
    label: string,
    ownerName: string | null,
  ): Promise<OAuthClientSummary> => {
    const { data } = await supabaseAdmin.auth.admin.oauth.getClient(clientId);
    return {
      clientId,
      label,
      ownerName,
      redirectUris: data?.redirect_uris ?? [],
    };
  };

  const registrations = profile?.oauthRegistrations ?? [];

  // One OAuth client per project since migration 32 -- fetch each
  // registration's live redirect URIs from the Admin SDK in parallel.
  const clients: OAuthClientSummary[] = await Promise.all(
    registrations.map(({ clientId, label }) =>
      summarise(clientId, label, null),
    ),
  );

  const productionRegistrations = canManageOAuthApps
    ? await db.query.oauthRegistrations.findMany({
        columns: { clientId: true, label: true },
        where: {
          OR: [{ status: "in_production" }, { userId: { isNull: true } }],
        },
        with: { profile: { columns: { preferredName: true } } },
        orderBy: { label: "asc" },
      })
    : [];
  const productionClients: OAuthClientSummary[] = await Promise.all(
    productionRegistrations.map(({ clientId, label, profile: owner }) =>
      summarise(clientId, label, owner?.preferredName ?? null),
    ),
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
    productionClients,
    canManageOAuthApps,
    // The gate asks a member with no client of their own to enable OAuth. It
    // has nothing to say to someone who is here to manage production clients.
    hasAnyClient: clients.length > 0 || canManageOAuthApps,
    hasGithub: githubIdentity !== null,
    testAccounts: mappedTestAccounts,
  };
});
