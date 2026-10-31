import { rules, type Caller } from "~/server/auth/access";

/**
 * The Record rule for an OAuth client: who may see and edit one.
 *
 * An app belongs to whoever registered it, published or not (they keep its
 * redirects, secret and label, Q155). A DevDogs app has no owner, so everyone
 * who holds `canManageOAuthApps` manages it. The client page, its loader and
 * the actions that edit a client all ask this, so they cannot disagree.
 * Anyone refused gets the "not found" they would get for a client that does
 * not exist, so the answer never says which ids are real.
 */
export function mayManageClient(
  registration: { userId: string | null },
  caller: Caller,
): boolean {
  return registration.userId === null
    ? rules.manageOAuthApps(caller)
    : registration.userId === caller.userId;
}
