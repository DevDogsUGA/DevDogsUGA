"use server";

import { authorize, rules, authorizeSession } from "~/server/auth/access";

import { failure, expected, type ActionResult } from "~/lib/actionResult";
import * as z from "zod";

import { db } from "../db";
import {
  forgetApproval as forgetApprovalStep,
  setAppStatus,
  setAsksForConsent as setAsksForConsentStep,
  transferToDevDogs as transferToDevDogsStep,
  APP_NOT_FOUND,
  type RevokeCounts,
} from "../oauth/appStatus";
import type { OAuthStatus } from "../oauth/status";
import { parseStatus } from "../oauth/status";

/**
 * The status and consent actions for OAuth apps (oauth-consent Q155–Q164).
 *
 * Status, the consent switch and Transfer to DevDogs are holder-only: a member
 * who owns an app cannot publish it. Every one is audited, and a status change
 * runs the kill switch. Forget approval is the owner's, for their own test
 * accounts, or any member's, for themselves.
 */

const NOT_AUTHORIZED = "Not authorized: canManageOAuthApps required";

const uuid = z.uuid();

export async function setStatus(
  clientId: string,
  status: OAuthStatus,
): Promise<ActionResult<{ changed: boolean; counts: RevokeCounts | null }>> {
  const access = await authorize(rules.manageOAuthApps);
  if (!access.ok) {
    return failure(NOT_AUTHORIZED);
  }

  const actorUserId = access.caller.userId;
  const parsedStatus = parseStatus(status);
  if (!parsedStatus || !uuid.safeParse(clientId).success) {
    return failure(APP_NOT_FOUND);
  }
  return expected(() =>
    setAppStatus({ actorUserId, clientId, status: parsedStatus }),
  );
}

export async function setAsksForConsent(
  clientId: string,
  asksForConsent: boolean,
): Promise<ActionResult<{ changed: boolean }>> {
  const access = await authorize(rules.manageOAuthApps);
  if (!access.ok) {
    return failure(NOT_AUTHORIZED);
  }

  const actorUserId = access.caller.userId;
  if (!uuid.safeParse(clientId).success) return failure(APP_NOT_FOUND);
  return expected(() =>
    setAsksForConsentStep({
      actorUserId,
      clientId,
      asksForConsent: asksForConsent === true,
    }),
  );
}

export async function transferToDevDogs(
  clientId: string,
): Promise<ActionResult<{ changed: boolean }>> {
  const access = await authorize(rules.manageOAuthApps);
  if (!access.ok) {
    return failure(NOT_AUTHORIZED);
  }

  const actorUserId = access.caller.userId;
  if (!uuid.safeParse(clientId).success) return failure(APP_NOT_FOUND);
  return expected(() => transferToDevDogsStep({ actorUserId, clientId }));
}

/**
 * Forgets `userId`'s approval of an app and ends their sessions with it.
 * Allowed for the member themselves (Remove access) and for an app's owner
 * acting on one of their own test accounts (Forget approval). Anyone else gets
 * the "not found" they would get for an app that does not exist.
 */
export async function forgetApproval(
  clientId: string,
  userId: string,
): Promise<RevokeCounts> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const actorUserId = access.caller.userId;
  if (!uuid.safeParse(clientId).success || !uuid.safeParse(userId).success) {
    throw new Error(APP_NOT_FOUND);
  }

  if (userId !== actorUserId) {
    const registration = await db.query.oauthRegistrations.findFirst({
      columns: { userId: true },
      where: { clientId },
    });
    const testAccount = await db.query.oauthTestAccounts.findFirst({
      columns: { testUserId: true },
      where: { testUserId: userId, ownerUserId: actorUserId },
    });
    if (registration?.userId !== actorUserId || !testAccount) {
      throw new Error(APP_NOT_FOUND);
    }
  }
  return forgetApprovalStep({ actorUserId, clientId, userId });
}
