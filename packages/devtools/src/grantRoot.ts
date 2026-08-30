/**
 * Granting yourself Root on your own instance.
 *
 * Every console page resolves through `getCallerContext()`, which reads
 * `resolvedUserPermissions`. A user with no roles resolves to
 * all-permissions-false, so on a freshly reset database the console is simply
 * invisible: no error, nothing to click. Somebody has to hold the first role,
 * and on a throwaway instance that somebody is you.
 *
 * THIS REPLACES `platform.claim_root()`, an RPC any authenticated caller could
 * invoke as long as nobody already held Root, gated on the instance not
 * reporting itself as production. Both halves were wrong. The gate was a column
 * in a table: data that had to be set correctly on every instance, could not be
 * checked by CI, and was writable by anything holding the service key. And the
 * capability behind it is a privilege escalation by construction. On a freshly
 * reset production database with sign-up open to the university, Root would
 * have gone to whoever authenticated first.
 *
 * What makes this safe is a credential, not a check. It writes the row with the
 * service key, read from `supabase status`, so the authorization is "you
 * already control this database". That is the only true statement available.
 * By hand the equivalent is one INSERT in the Supabase dashboard.
 */
import { adminClient, ROOT_ROLE_ID, type Instance } from "./instance.js";

export interface RootHolder {
  userId: string;
  email: string;
}

/** Who holds Root right now, if anyone. */
export async function currentRootHolder(
  instance: Instance,
): Promise<RootHolder | null> {
  const admin = adminClient(instance);

  const { data, error } = await admin
    .from("userRoles")
    .select("userId")
    .eq("roleId", ROOT_ROLE_ID)
    .limit(1);
  if (error)
    throw new Error(`Could not read platform."userRoles": ${error.message}`);

  const userId = data?.[0]?.userId as string | undefined;
  if (!userId) return null;

  const { data: user } = await admin.auth.admin.getUserById(userId);
  return { userId, email: user.user?.email ?? "(no email)" };
}

/** Everyone who could be granted it, sorted by email. */
export async function listCandidates(
  instance: Instance,
): Promise<RootHolder[]> {
  const admin = adminClient(instance);
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(`Could not list accounts: ${error.message}`);

  return data.users
    .map((u) => ({ userId: u.id, email: u.email ?? "(no email)" }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Writes the Root grant.
 *
 * `userRoles_root_singleton` is a unique index, so a second grant fails at the
 * database rather than here. This check exists to fail with a sentence a
 * contributor can act on, the same reasoning the RPC's version had.
 */
export async function grantRoot(
  instance: Instance,
  userId: string,
): Promise<void> {
  const admin = adminClient(instance);

  const { data: role, error: roleErr } = await admin
    .from("roles")
    .select("id")
    .eq("id", ROOT_ROLE_ID)
    .maybeSingle();
  if (roleErr)
    throw new Error(`Could not read platform."roles": ${roleErr.message}`);
  if (!role) {
    throw new Error(
      "The Root role definition is missing. It comes from supabase/seed/01_roles.sql, " +
        "which runs on `pnpm devtools reset` — seeds do not run on `push`.",
    );
  }

  const { error } = await admin
    .from("userRoles")
    .insert({ userId, roleId: ROOT_ROLE_ID });
  if (error) throw new Error(`Could not grant Root: ${error.message}`);
}

/** Hands Root to somebody else, which takes removing it first. */
export async function transferRoot(
  instance: Instance,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  const admin = adminClient(instance);

  const { error: removeErr } = await admin
    .from("userRoles")
    .delete()
    .eq("roleId", ROOT_ROLE_ID)
    .eq("userId", fromUserId);
  if (removeErr) {
    throw new Error(`Could not release Root: ${removeErr.message}`);
  }

  await grantRoot(instance, toUserId);
}
