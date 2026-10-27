"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import * as z from "zod";
import { zfd } from "zod-form-data";
import { expectSession } from "~/server/auth";
import { approveAs, denyAs } from "~/server/oauth/asAccount";
import {
  loadConsentRequest,
  resolveConsentAccount,
} from "~/server/oauth/consentRequest";

/**
 * Allow and Cancel on the consent card. Both are Server Actions, so they carry
 * the framework's same-origin check on the POST, which is the CSRF protection
 * the old approve action had. Neither trusts the page: the registration, the
 * decision and the account are all read again here, so a forged form cannot
 * approve as an account the page would not have offered.
 */

const consentSchema = zfd.formData({
  authorization_id: zfd.text(),
  /** Testing apps only: the owner or one of their test accounts. */
  accountId: zfd.text(z.uuid().optional()),
});

const GONE = "This request has expired. Start again from the app.";

async function decide(
  formData: FormData,
  act: typeof approveAs | typeof denyAs,
): Promise<string | null> {
  const parsed = consentSchema.safeParse(formData);
  if (!parsed.success) return "Invalid form data";
  const { authorization_id: authorizationId, accountId } = parsed.data;

  try {
    const userId = await expectSession().catch(() => null);
    if (!userId) return "You are signed out. Sign in again and retry.";

    const request = await loadConsentRequest(authorizationId, userId);
    if (!request) return GONE;

    const account = await resolveConsentAccount(request, accountId ?? null);
    if (!account) return "That account can't be used for this app.";

    redirect(await act(account.actor, authorizationId));
  } catch (err) {
    unstable_rethrow(err);
    console.error(err);
    return GONE;
  }
}

export async function allowConsent(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  return decide(formData, approveAs);
}

export async function cancelConsent(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  return decide(formData, denyAs);
}
