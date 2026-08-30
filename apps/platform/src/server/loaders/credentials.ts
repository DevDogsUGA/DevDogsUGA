import { cache } from "react";
import { requirePermission } from "~/server/auth/require";
import { canUserCreateCredentials } from "~/server/actions/permissions";
import {
  canSeeCredentialsPage,
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
    // The navbar hides this page behind `canSeeCredentialsPage`, but until now
    // the page itself asked only for a session, so a member with no
    // credential-granting role who typed the URL got the full Credentials page
    // with an empty list. Nothing leaked (`getAccessibleCredentials` filters by
    // role), but a page that renders its own emptiness is a worse answer than
    // not being there, and it disagreed with the menu about whether it exists.
    const userId = await requirePermission(canSeeCredentialsPage);

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
