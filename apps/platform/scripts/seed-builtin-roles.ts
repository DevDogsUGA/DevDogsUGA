import "./loadEnv";

import { asc, eq, notExists } from "drizzle-orm";
import { db } from "~/server/db";
import {
  MEMBER_ROLE_ID,
  ROOT_ROLE_ID,
  oauthTestAccounts,
  profiles,
  roles,
  userRoles,
} from '~/server/db/schema';
import { usersInAuth } from "~/supabase/drizzle/schema";

const ALL_FALSE = {
  canModerate: false,
  canManageRoles: false,
  canManageSuspensions: false,
  canViewAuditLog: false,
  canManageFeedback: false,
  canCreateCredentials: false,
  canManageVerification: false,
} as const;

const ALL_TRUE = {
  canModerate: true,
  canManageRoles: true,
  canManageSuspensions: true,
  canViewAuditLog: true,
  canManageFeedback: true,
  canCreateCredentials: true,
  canManageVerification: true,
} as const;

async function main() {
  // Ensure the Member and Root definition rows exist.
  await db
    .insert(roles)
    .values([
      {
        id: MEMBER_ROLE_ID,
        title: "Member",
        description: "Default role for every member. No special permissions.",
        roleType: "default",
        rank: null,
        ...ALL_FALSE,
      },
      {
        id: ROOT_ROLE_ID,
        title: "Root",
        description:
          "Full access to every permission. Singleton — transferable, never directly assigned or removed.",
        roleType: "root",
        rank: null,
        ...ALL_TRUE,
      },
    ])
    .onConflictDoNothing();

  // If nobody holds Root yet, bootstrap it onto the earliest non-test user.
  const [holder] = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.roleId, ROOT_ROLE_ID))
    .limit(1);

  if (!holder) {
    const [first] = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .innerJoin(usersInAuth, eq(usersInAuth.id, profiles.userId))
      .where(
        notExists(
          db
            .select()
            .from(oauthTestAccounts)
            .where(eq(oauthTestAccounts.testUserId, profiles.userId)),
        ),
      )
      .orderBy(asc(usersInAuth.createdAt))
      .limit(1);

    if (first) {
      await db
        .insert(userRoles)
        .values({ userId: first.userId, roleId: ROOT_ROLE_ID })
        .onConflictDoNothing();
    }
  }
}

await main();
process.exit(0);
