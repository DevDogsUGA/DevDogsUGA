import { count, eq } from "drizzle-orm";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { TestAccount } from "~/server/actions/testAccounts";
import { expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import { profiles, roles, userRoles } from "~/server/db/schema";
import {
  getInvolvementFullName,
  getVerificationStatus,
} from "~/server/loaders/verification";
import { supabaseAdmin } from "~/supabase/admin";

export type AssignedRole = {
  roleId: string;
  roleTitle: string;
  roleColor: string | null;
};

export const getProfilePageData = cache(async () => {
  const user = await expectUserWith({
    profile: {
      with: { links: { orderBy: (t, { asc }) => asc(t.sortOrder) } },
    },
    githubIdentity: { columns: { identityData: true } },
    discordIdentity: { columns: { identityData: true } },
    linkedinIdentity: { columns: { identityData: true } },
  }).catch(() => redirect("/auth"));

  const [, assignedRoleRows, verification] = await Promise.all([
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
  };
});

export const getOAuthPageData = cache(async () => {
  const { profile, githubIdentity, testAccounts } = await expectUserWith({
    profile: {
      with: {
        oauthRegistration: {
          columns: { clientId: true },
          with: {},
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

  const clientId = profile?.oauthRegistration?.clientId ?? null;

  const redirectUris: string[] = [];
  if (clientId) {
    const { data } = await supabaseAdmin.auth.admin.oauth.getClient(clientId);
    if (data) redirectUris.push(...data.redirect_uris);
  }

  const mappedTestAccounts: TestAccount[] = testAccounts.map(
    ({ user, createdAt }) => ({
      userId: user.id,
      displayName:
        user.rawUserMetaData &&
        typeof user.rawUserMetaData === "object" &&
        "display_name" in user.rawUserMetaData &&
        typeof user.rawUserMetaData.display_name === "string"
          ? user.rawUserMetaData.display_name
          : "Test User",
      createdAt: createdAt.toISOString(),
    }),
  );

  return {
    clientId,
    redirectUris,
    hasGithub: githubIdentity !== null,
    testAccounts: mappedTestAccounts,
  };
});
