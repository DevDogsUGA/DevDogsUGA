"use server";

import * as z from "zod";
import { expectSession } from "../auth";
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
import { canUserManageOAuthApps } from "./permissions";

/**
 * The status and consent actions for OAuth apps (oauth-consent Q155–Q164).
 * No UI yet: E3 builds Console → Apps and the settings panel on top of these.
 *
 * Status, the consent switch and Transfer to DevDogs are holder-only: a member
 * who owns an app cannot publish it. Every one is audited, and a status change
 * runs the kill switch. Forget approval is the owner's, for their own test
 * accounts, or any member's, for themselves.
 */

export const NOT_AUTHORIZED = "Not authorized: canManageOAuthApps required";

const uuid = z.uuid();

/** The signed-in member, if they hold `canManageOAuthApps`. */
async function requireHolder(): Promise<string> {
  const userId = await expectSession();
  if (!(await canUserManageOAuthApps(userId))) throw new Error(NOT_AUTHORIZED);
  return userId;
}

export async function setStatus(
  clientId: string,
  status: OAuthStatus,
): Promise<{ changed: boolean; counts: RevokeCounts | null }> {
  const actorUserId = await requireHolder();
  const parsedStatus = parseStatus(status);
  if (!parsedStatus || !uuid.safeParse(clientId).success) {
    throw new Error(APP_NOT_FOUND);
  }
  return setAppStatus({ actorUserId, clientId, status: parsedStatus });
}

export async function setAsksForConsent(
  clientId: string,
  asksForConsent: boolean,
): Promise<{ changed: boolean }> {
  const actorUserId = await requireHolder();
  if (!uuid.safeParse(clientId).success) throw new Error(APP_NOT_FOUND);
  return setAsksForConsentStep({
    actorUserId,
    clientId,
    asksForConsent: asksForConsent === true,
  });
}

export async function transferToDevDogs(
  clientId: string,
): Promise<{ changed: boolean }> {
  const actorUserId = await requireHolder();
  if (!uuid.safeParse(clientId).success) throw new Error(APP_NOT_FOUND);
  return transferToDevDogsStep({ actorUserId, clientId });
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
  const actorUserId = await expectSession();
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
