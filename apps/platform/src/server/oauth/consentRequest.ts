import "server-only";
import { db } from "~/server/db";
import { testAccountName } from "~/lib/testAccountName";
import type { ConsentActor } from "./asAccount";
import {
  findConsentTarget,
  findDisplayName,
  isTestIdentity,
  type ConsentTarget,
} from "./consentTarget";
import { decideConsent, type ConsentDecision } from "./status";

/** Who a consent card is for: the account that would be signed in. */
export interface ConsentAccount {
  actor: ConsentActor;
  /** The account's user id (the member's own, or a test account's). */
  userId: string;
  /** What the card calls them: the display name, else the email. */
  name: string;
  /** Their email address, shown beside the name. */
  email: string | null;
  /** Whether it is a test account the owner picked. */
  isTestAccount: boolean;
}

export interface ConsentRequest {
  target: ConsentTarget;
  decision: ConsentDecision;
  /** The signed-in member. */
  userId: string;
}

/**
 * The registration and decision behind one authorization for the member who
 * is signed in, or null when there is no such authorization. The page and the
 * Allow / Cancel actions both go through this, so what the page showed is what
 * the action re-checks.
 */
export async function loadConsentRequest(
  authorizationId: string,
  userId: string,
): Promise<ConsentRequest | null> {
  const target = await findConsentTarget(authorizationId);
  if (!target) return null;
  const decision = decideConsent({
    status: target.status,
    asksForConsent: target.asksForConsent,
    redirectUri: target.redirectUri,
    ownerUserId: target.ownerUserId,
    userId,
    isTestIdentity: await isTestIdentity(userId),
  });
  return { target, decision, userId };
}

/**
 * Resolves the account a card (or its Allow / Cancel) acts for.
 *
 * - `consent` (In production): always the member themselves; any other
 *   account id is refused, there is no picker (Q164).
 * - `pick-account` (Testing, the owner): the owner or one of the owner's own
 *   test accounts, named by `accountId`. No id means nothing is picked yet
 *   (null), and an id that is not the owner's is refused (null).
 * - Anything else: null.
 */
export async function resolveConsentAccount(
  request: Pick<ConsentRequest, "decision" | "userId">,
  accountId: string | null,
): Promise<ConsentAccount | null> {
  const { decision, userId } = request;

  if (decision === "consent") {
    if (accountId && accountId !== userId) return null;
    return selfAccount(userId);
  }
  if (decision !== "pick-account" || !accountId) return null;
  if (accountId === userId) return selfAccount(userId);

  const testAccount = await db.query.oauthTestAccounts.findFirst({
    where: { ownerUserId: userId, testUserId: accountId },
    with: {
      user: { columns: { email: true, rawUserMetaData: true } },
    },
  });
  if (!testAccount?.user.email) return null;
  return {
    actor: { kind: "test", email: testAccount.user.email },
    userId: accountId,
    name: testAccountName(testAccount.user.rawUserMetaData),
    email: testAccount.user.email,
    isTestAccount: true,
  };
}

async function selfAccount(userId: string): Promise<ConsentAccount> {
  const user = await db.query.usersInAuth.findFirst({
    columns: { email: true },
    where: { id: userId },
  });
  const name = await findDisplayName(userId);
  return {
    actor: { kind: "self" },
    userId,
    name: name ?? user?.email ?? "You",
    email: user?.email ?? null,
    isTestAccount: false,
  };
}
