"use server";

import { authorizeSession, callerFor } from "~/server/auth/access";
import {
  ExpectedFailure,
  expected,
  type ActionResult,
} from "~/lib/actionResult";

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
import { mayManageClient } from "../oauth/managedClient";
import { z } from "zod";

/**
 * The details of an OAuth app: logo, homepage and privacy policy (oauth-consent
 * Q159). All three are optional while the app is in Testing; the holder cannot
 * publish it until all three are set.
 *
 * The owner edits their own app's details, Testing or In production. A DevDogs
 * app has no owner, so whoever holds `canManageOAuthApps` edits it. Anyone else
 * gets the "not found" they would get for an app that does not exist.
 */

const uuid = z.uuid();

async function requireEditableApp(clientId: string) {
  const userId = await expectSession();
  if (!uuid.safeParse(clientId).success)
    throw new ExpectedFailure(APP_NOT_FOUND);

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
  if (!app) throw new ExpectedFailure(APP_NOT_FOUND);

  if (!mayManageClient(app, await callerFor(userId)))
    throw new ExpectedFailure(APP_NOT_FOUND);
  return { userId, app };
}

/** A published app, or a DevDogs one, is one real members sign in with. */
function isLive(app: { userId: string | null; status: string }) {
  return app.userId === null || app.status === "in_production";
}

/** Why a published app's link cannot be cleared. */
const NEEDS_LINKS =
  "A published app needs a homepage and a privacy policy. Return it to Testing first to clear one";

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

/**
 * Saves the homepage and privacy policy, whichever the caller sends: the page's
 * Draft saves each link as its own field, so an omitted link is left as it is.
 * Refused while the app is published. A rejected link comes back under its
 * field id (`homepageUrl`, `privacyPolicyUrl`).
 */
export async function saveAppDetails(
  clientId: string,
  input: { homepageUrl?: string; privacyPolicyUrl?: string },
): Promise<ActionResult> {
  const access = await authorizeSession();
  if (!access.ok) {
    throw new Error(access.message);
  }

  const { userId, app } = await requireEditableApp(clientId);
  return expected(async () => {
    if (brandingLocked(app)) throw new ExpectedFailure(BRANDING_LOCKED);

    const fieldErrors: Record<string, string> = {};
    const homepage =
      input.homepageUrl === undefined
        ? undefined
        : parseDetailUrl("Homepage", input.homepageUrl);
    if (homepage?.error) fieldErrors.homepageUrl = homepage.error;
    const privacy =
      input.privacyPolicyUrl === undefined
        ? undefined
        : parseDetailUrl("Privacy policy", input.privacyPolicyUrl);
    if (privacy?.error) fieldErrors.privacyPolicyUrl = privacy.error;
    const firstError = Object.values(fieldErrors)[0];
    if (firstError) throw new ExpectedFailure(firstError, fieldErrors);

    const homepageUrl =
      homepage === undefined ? app.homepageUrl : homepage.value;
    const privacyPolicyUrl =
      privacy === undefined ? app.privacyPolicyUrl : privacy.value;
    // A DevDogs app stays editable in production, but never loses the details
    // publishing requires (Q159).
    if (app.status === "in_production") {
      if (homepage !== undefined && !homepageUrl)
        fieldErrors.homepageUrl = NEEDS_LINKS;
      if (privacy !== undefined && !privacyPolicyUrl)
        fieldErrors.privacyPolicyUrl = NEEDS_LINKS;
      if (Object.keys(fieldErrors).length > 0)
        throw new ExpectedFailure(NEEDS_LINKS, fieldErrors);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(oauthRegistrations)
        .set({
          ...(homepage === undefined ? {} : { homepageUrl: homepage.value }),
          ...(privacy === undefined ? {} : { privacyPolicyUrl: privacy.value }),
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
              homepageUrl,
              privacyPolicyUrl,
            },
          }),
        );
      }
    });
    return undefined;
  });
}

/**
 * A token to upload the cropped logo into the public avatars bucket, at a fresh
 * path in this app's folder (`apps/<clientId>/<uuid>.webp`). The browser
 * uploads straight to Storage; `saveAppLogo` then records that path. Signed
 * upload URLs stay valid for two hours, so the path is never reused. The first
 * step of the logo flow, a Command of its own: a locked app or one the member
 * does not manage comes back as a failure.
 */
export async function createAppLogoUploadToken(
  clientId: string,
): Promise<ActionResult<{ path: string; token: string; maxBytes: number }>> {
  const access = await authorizeSession();
  if (!access.ok) return access;

  return expected(async () => {
    const { app } = await requireEditableApp(clientId);
    if (brandingLocked(app)) throw new ExpectedFailure(BRANDING_LOCKED);
    const path = appLogoPath(clientId, crypto.randomUUID());
    const { data, error } = await supabaseAdmin.storage
      .from(env.NEXT_PUBLIC_AVATARS_BUCKET)
      .createSignedUploadUrl(path);
    if (error ?? !data) throw new Error("Failed to create the logo upload");
    return { path, token: data.token, maxBytes: APP_LOGO_MAX_BYTES };
  });
}

/** Records the uploaded logo on the app, once the object is really there. The last step of the logo flow. */
export async function saveAppLogo(
  clientId: string,
  path: string,
): Promise<ActionResult> {
  const access = await authorizeSession();
  if (!access.ok) return access;

  return expected(async (): Promise<undefined> => {
    const { userId, app } = await requireEditableApp(clientId);
    if (brandingLocked(app)) throw new ExpectedFailure(BRANDING_LOCKED);
    if (!isAppLogoPath(clientId, path)) {
      throw new ExpectedFailure("The logo did not upload. Try again");
    }

    const { data: exists, error } = await supabaseAdmin.storage
      .from(env.NEXT_PUBLIC_AVATARS_BUCKET)
      .exists(path);
    if (error || !exists) {
      throw new ExpectedFailure("The logo did not upload. Try again");
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
  });
}
