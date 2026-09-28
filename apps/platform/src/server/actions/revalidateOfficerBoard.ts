"use server";

import { and, eq } from "drizzle-orm";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { roles, userRoles } from "~/server/db/schema";
import { revalidateOfficers } from "~/server/loaders/officers";

/**
 * For the /account fields that write `profile` and `profileLinks` straight
 * through the Supabase client, where no server code sees the write. Only an
 * officer's edit can change the board, so only an officer's call invalidates
 * it; anyone else's is a no-op rather than a way to make the homepage rebuild
 * on demand.
 */
export default async function revalidateOfficerBoard(): Promise<void> {
  const userId = await expectSession().catch(() => null);
  if (!userId) return;

  const [leadership] = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(roles.isLeadership, true)))
    .limit(1);

  if (leadership) revalidateOfficers();
}
