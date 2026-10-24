"use server";

import { eq } from "drizzle-orm";
import { env } from "~/env";
import { supabaseAdmin } from "~/supabase/admin";
import { expectSession } from "../auth";
import { db } from "../db";
import { auditEvents, oauthRegistrations } from "../db/schema";
import {
  appLogoPath,
  isAppLogoPath,
  parseDetailUrl,
  APP_LOGO_MAX_BYTES,
} from "../oauth/appDetails";
import { APP_NOT_FOUND } from "../oauth/appStatus";
import { oauthAuditEvent } from "../oauth/audit";
import { z } from "zod";
import { canUserManageOAuthApps } from "./permissions";

/**
 * The details of an OAuth app: logo, homepage and privacy policy (oauth-consent
 * Q159). All three are optional while the app is in Testing; the holder cannot
 * publish it until all three are set.
 *
 * The owner edits their own app's details, Testing or In production. A DevDogs
 * app has no owner, so whoever holds `canManageOAuthApps` edits it. Anyone else
 * gets the "not found" they would get for an app that does not exist.
 */

export type DetailsResult = { ok: true } | { ok: false; error: string };

const uuid = z.uuid();

async function requireEditableApp(clientId: string) {
  const userId = await expectSession();
  if (!uuid.safeParse(clientId).success) throw new Error(APP_NOT_FOUND);

  const app = await db.query.oauthRegistrations.findFirst({
    columns: {
      clientId: true,
      userId: true,
      label: true,
      status: true,
      logoPath: true,
      homepageUrl: true,
      privacyPolicyUrl: true,
    },
    where: { clientId },
  });
  if (!app) throw new Error(APP_NOT_FOUND);

  const allowed =
    app.userId === null
      ? await canUserManageOAuthApps(userId)
      : app.userId === userId;
  if (!allowed) throw new Error(APP_NOT_FOUND);
  return { userId, app };
}

/** A published app, or a DevDogs one, is one real members sign in with. */
function isLive(app: { userId: string | null; status: string }) {
  return app.userId === null || app.status === "in_production";
}

/** Why an owner cannot touch a published app's logo, homepage or privacy policy. */
const BRANDING_LOCKED =
  "The logo, homepage and privacy policy are locked while an app is in production. Ask an officer to return it to Testing first";

/**
 * Q178: a member's published app keeps the branding its members approved.
 * Enforced here, on the server. A DevDogs app has no owner to lock out; the
 * officers who edit it can already return it to Testing themselves.
 */
function brandingLocked(app: { userId: string | null; status: string }) {
  return app.userId !== null && app.status === "in_production";
}

/** Saves the homepage and privacy policy. Refused while the app is published. */
export async function saveAppDetails(
  clientId: string,
  input: { homepageUrl: string; privacyPolicyUrl: string },
): Promise<DetailsResult> {
  const { userId, app } = await requireEditableApp(clientId);
  if (brandingLocked(app)) return { ok: false, error: BRANDING_LOCKED };

  const homepage = parseDetailUrl("Homepage", input.homepageUrl);
  if (homepage.error) return { ok: false, error: homepage.error };
  const privacy = parseDetailUrl("Privacy policy", input.privacyPolicyUrl);
  if (privacy.error) return { ok: false, error: privacy.error };
  // A DevDogs app stays editable in production, but never loses the details
  // publishing requires (Q159).
  if (app.status === "in_production" && (!homepage.value || !privacy.value)) {
    return {
      ok: false,
      error:
        "A published app needs a homepage and a privacy policy. Return it to Testing first to clear one",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(oauthRegistrations)
      .set({
        homepageUrl: homepage.value,
        privacyPolicyUrl: privacy.value,
      })
      .where(eq(oauthRegistrations.clientId, clientId));
    if (isLive(app)) {
      await tx.insert(auditEvents).values(
        oauthAuditEvent({
          actorUserId: userId,
          action: "oauth_app.details_changed",
          clientId,
          metadata: {
            label: app.label,
            field: "links",
            homepageUrl: homepage.value,
            privacyPolicyUrl: privacy.value,
          },
        }),
      );
    }
  });
  return { ok: true };
}

/**
 * A token to upload the cropped logo into the public avatars bucket, at a fresh
 * path in this app's folder (`apps/<clientId>/<uuid>.webp`). The browser
 * uploads straight to Storage; `saveAppLogo` then records that path. Signed
 * upload URLs stay valid for two hours, so the path is never reused.
 */
export async function createAppLogoUploadToken(
  clientId: string,
): Promise<{ path: string; token: string; maxBytes: number }> {
  const { app } = await requireEditableApp(clientId);
  if (brandingLocked(app)) throw new Error(BRANDING_LOCKED);
  const path = appLogoPath(clientId, crypto.randomUUID());
  const { data, error } = await supabaseAdmin.storage
    .from(env.NEXT_PUBLIC_AVATARS_BUCKET)
    .createSignedUploadUrl(path);
  if (error ?? !data) throw new Error("Failed to create the logo upload");
  return { path, token: data.token, maxBytes: APP_LOGO_MAX_BYTES };
}

/** Records the uploaded logo on the app, once the object is really there. */
export async function saveAppLogo(
  clientId: string,
  path: string,
): Promise<DetailsResult> {
  const { userId, app } = await requireEditableApp(clientId);
  if (brandingLocked(app)) return { ok: false, error: BRANDING_LOCKED };
  if (!isAppLogoPath(clientId, path)) {
    return { ok: false, error: "The logo did not upload. Try again" };
  }

  const { data: exists, error } = await supabaseAdmin.storage
    .from(env.NEXT_PUBLIC_AVATARS_BUCKET)
    .exists(path);
  if (error || !exists) {
    return { ok: false, error: "The logo did not upload. Try again" };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(oauthRegistrations)
      .set({ logoPath: path })
      .where(eq(oauthRegistrations.clientId, clientId));
    if (isLive(app)) {
      await tx.insert(auditEvents).values(
        oauthAuditEvent({
          actorUserId: userId,
          action: "oauth_app.details_changed",
          clientId,
          metadata: { label: app.label, field: "logo", logoPath: path },
        }),
      );
    }
  });
  return { ok: true };
}
