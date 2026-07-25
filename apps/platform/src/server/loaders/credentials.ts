import { cache } from "react";
import { redirect } from "next/navigation";
import { expectSession } from "~/server/auth";
import { canUserCreateCredentials } from "~/server/actions/permissions";
import {
  getAccessibleCredentials,
  type CredentialRow,
} from "~/server/actions/credentials";
import { asc } from "drizzle-orm";
import { db } from "~/server/db";
import { roles } from "~/server/db/schema";

export type CredentialsPageData = {
  credentials: CredentialRow[];
  canCreate: boolean;
  allRoles: Array<{ id: string; title: string }>;
};

export const getCredentialsPageData = cache(
  async (): Promise<CredentialsPageData> => {
    const userId = await expectSession().catch(() => redirect("/auth"));

    const [credentialsList, canCreate, roleRows] = await Promise.all([
      getAccessibleCredentials(userId),
      canUserCreateCredentials(userId),
      db
        .select({ id: roles.id, title: roles.title })
        .from(roles)
        .orderBy(asc(roles.rank)),
    ]);

    return {
      credentials: credentialsList,
      canCreate,
      allRoles: roleRows,
    };
  },
);
