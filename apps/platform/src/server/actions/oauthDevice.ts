"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import * as z from "zod";
import { zfd } from "zod-form-data";
import { authenticate, expectSession, expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import { oauthDeviceCodes } from "~/server/db/schema";
import {
  formatUserCode,
  hashUserCode,
  normalizeUserCode,
} from "~/server/oauth/deviceCodes";
import { createOauthClientAndRegister } from "~/server/oauth/registerClient";
import { supabaseAdmin } from "~/supabase/admin";

/**
 * The consent step of the `devtools oauth` device-code handoff. Both
 * actions take the same `userCode` hidden field `~/app/(site)/tools/oauth/
 * device/page.tsx`'s consent card posts back -- the page has already looked
 * the row up once to render the label/callback, but a form POST is a
 * separate request, so this re-validates and re-looks-up rather than
 * trusting the label/callback the hidden fields would otherwise carry.
 */
const deviceActionSchema = zfd.formData({
  userCode: zfd.text(z.string().min(1)),
});

function devicePath(userCode: string): string {
  return `/tools/oauth/device?${new URLSearchParams({ user_code: formatUserCode(userCode) }).toString()}`;
}

export async function denyDevice(formData: FormData): Promise<void> {
  const { userCode } = deviceActionSchema.parse(formData);
  const normalized = normalizeUserCode(userCode);
  if (!normalized) throw new Error("Invalid code.");

  // Signed in to deny as well as to approve: otherwise anyone holding (or
  // guessing) a code could cancel someone else's pending request.
  const userId = await expectSession().catch(() =>
    authenticate("google", devicePath(normalized)),
  );

  await db
    .update(oauthDeviceCodes)
    .set({ status: "denied", userId })
    .where(
      and(
        eq(oauthDeviceCodes.userCodeHash, hashUserCode(normalized)),
        eq(oauthDeviceCodes.status, "pending"),
      ),
    );

  redirect(devicePath(normalized));
}

export async function approveDevice(formData: FormData): Promise<void> {
  const { userCode } = deviceActionSchema.parse(formData);
  const normalized = normalizeUserCode(userCode);
  if (!normalized) throw new Error("Invalid code.");

  const user = await expectUserWith({
    githubIdentity: { columns: { id: true } },
  }).catch(() => authenticate("google", devicePath(normalized)));

  if (!user.githubIdentity) {
    throw new Error(
      "A linked GitHub account is required to connect an OAuth client",
    );
  }

  const userCodeHash = hashUserCode(normalized);
  const row = await db.query.oauthDeviceCodes.findFirst({
    where: { userCodeHash, status: "pending" },
  });

  if (!row || row.expiresAt.getTime() < Date.now()) {
    throw new Error("That code is invalid or has expired.");
  }

  const { clientId, clientSecret } = await createOauthClientAndRegister({
    label: row.label,
    callbackUri: row.callbackUri,
    userId: user.id,
  });

  // Claim only a still-pending row: a double-clicked Approve (or an Approve
  // racing a Deny) must not overwrite the first outcome. The loser deletes
  // the client it just minted; its `oauthRegistrations` row cascades.
  const [claimed] = await db
    .update(oauthDeviceCodes)
    .set({ status: "approved", userId: user.id, clientId, clientSecret })
    .where(
      and(
        eq(oauthDeviceCodes.id, row.id),
        eq(oauthDeviceCodes.status, "pending"),
      ),
    )
    .returning({ id: oauthDeviceCodes.id });
  if (!claimed) {
    await supabaseAdmin.auth.admin.oauth.deleteClient(clientId);
  }

  redirect(devicePath(normalized));
}
