"use server";

import { authorize, rules } from "~/server/auth/access";
import { revalidateOfficers } from "~/server/loaders/officers";

/**
 * For the /account fields that write `profile` and `profileLinks` straight
 * through the Supabase client, where no server code sees the write. Only an
 * officer's edit can change the board, so only an officer's call invalidates
 * it; anyone else's is a no-op rather than a way to make the homepage rebuild
 * on demand.
 */
export default async function revalidateOfficerBoard(): Promise<void> {
  const access = await authorize(rules.officer);
  if (access.ok) revalidateOfficers();
}
