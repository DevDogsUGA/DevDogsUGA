"use server";

import { failure, success, type ActionResult } from "~/lib/actionResult";
import { authorize, callerFor, rules } from "~/server/auth/access";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";
import { auditEvents, moderationClients } from "~/server/db/schema";

import { oauthAuditEvent } from "~/server/oauth/audit";
import { parseContentTypes } from "~/server/moderation/contentTypes";
import { endpointUrlProblem } from "~/server/moderation/endpoint";
import { raisedMessage } from "~/server/moderation/errors";
import { resetForResend } from "~/server/moderation/deliveryStore";
import { queueDeliveriesQuietly } from "~/server/moderation/queue";
import { deriveClientSecret } from "~/server/moderation/secrets";

const RESEND_FORBIDDEN = "You cannot resend moderation deliveries.";

/**
 * Puts an undelivered decision back on the queue.
 *
 * Only a `failed` or `pending` delivery resets: a delivered one is already in
 * the app's `moderation_events`, which ignores a replay of the same message id,
 * so resending it would change nothing but the status the console shows.
 */
export async function resendDelivery(
  deliveryId: string,
): Promise<ActionResult> {
  const access = await authorize(rules.moderate);
  if (!access.ok) return failure(RESEND_FORBIDDEN);

  const userId = access.caller.userId;
  if (!(await callerFor(userId).then(rules.moderate))) {
    return failure(RESEND_FORBIDDEN);
  }
  const reset = await resetForResend(deliveryId);
  if (reset) {
    await queueDeliveriesQuietly([deliveryId]);
  }
  revalidatePath("/dashboard/moderation", "layout");
  return reset
    ? success(undefined, "Queued to send again.")
    : failure(
        "That decision was already delivered, or no longer exists, so there is nothing to resend.",
      );
}

/** What registering an app returns: the secret is shown once, inline. */
export interface RegisteredApp {
  /** Present when registering created the client's moderation record. */
  secret?: string;
}

const SLUG = /^[a-z][a-z0-9-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Registers an OAuth client as a production moderation app: its reports reach
 * moderators from now on, and decisions are delivered to `endpointUrl`.
 *
 * Only a production-tier client can be registered (once the OAuth tiers are
 * in; before that the registry alone decides). When registering is what first
 * gives the client a moderation record, the client's signing secret is shown
 * here, once: no other step reveals it, and the app needs it in its
 * environment. A client whose owner already turned moderation on from
 * `/dashboard/oauth` keeps the secret the owner saw; they rotate there to get a
 * new one.
 *
 * Registering needs `canManageOAuthApps`, the permission that creates and
 * manages production OAuth clients: an app that can report content and receive
 * decisions about members is the same level of trust as one that signs them
 * in. The registration is audited like every other production client change.
 */
export async function registerExternalApp(
  formData: FormData,
): Promise<ActionResult<RegisteredApp>> {
  const access = await authorize(rules.manageOAuthApps);
  if (!access.ok) return failure("You cannot register apps");

  const userId = access.caller.userId;
  if (!(await callerFor(userId).then(rules.manageOAuthApps))) {
    return failure("You cannot register apps");
  }

  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const slug = text("slug");
  const displayName = text("displayName");
  const clientId = text("clientId");
  const endpointUrl = text("endpointUrl");

  if (!SLUG.test(slug)) {
    return failure("The slug is lowercase letters, digits and hyphens");
  }
  if (!displayName) return failure("A name is required");
  if (!UUID.test(clientId)) return failure("The client id is a UUID");
  const problem = endpointUrlProblem(endpointUrl);
  if (problem) return failure(problem);
  const parsed = parseContentTypes(text("contentTypes"));
  if (!parsed.ok) return failure(parsed.message);

  const [before] = await db
    .select({ clientId: moderationClients.clientId })
    .from(moderationClients)
    .where(eq(moderationClients.clientId, clientId.toLowerCase()));

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select "platform".register_external_app(
              ${slug}, ${displayName}, ${clientId.toLowerCase()}::uuid,
              ${endpointUrl}, ${JSON.stringify(parsed.types)}::jsonb
            )`,
      );
      // After the function: it refuses a development client, and a refused
      // registration must leave no entry.
      await tx.insert(auditEvents).values(
        oauthAuditEvent({
          actorUserId: userId,
          action: "oauth_client.moderation_registered",
          clientId: clientId.toLowerCase(),
          metadata: { slug, endpointUrl },
        }),
      );
    });
  } catch (error) {
    const cause = raisedMessage(error);
    if (/moderationClients_clientId_fkey|violates foreign key/.test(cause)) {
      return failure("No OAuth client has that id");
    }
    if (cause.includes("moderation:client_deleted")) {
      return failure("That OAuth client has been deleted");
    }
    if (cause.includes("moderation:client_unregistered")) {
      return failure(
        "No OAuth client registered through /dashboard/oauth has that id. Create the app there first",
      );
    }
    if (cause.includes("moderation:development_client")) {
      return failure(
        "That app is in Testing. Only an app In production can be registered",
      );
    }
    if (cause.includes("is a platform app")) {
      return failure("That slug belongs to a platform app");
    }
    throw error;
  }

  revalidatePath("/dashboard/moderation", "layout");
  if (!before && env.MODERATION_SIGNING_KEY) {
    return success(
      {
        secret: await deriveClientSecret(
          env.MODERATION_SIGNING_KEY,
          clientId.toLowerCase(),
          1,
        ),
      },
      `${displayName} is registered. Copy the secret into the app's environment now: it is shown once.`,
    );
  }
  return success(
    undefined,
    before
      ? `${displayName} is registered. Its secret was shown when moderation was first turned on; rotate it under Tools, OAuth if it is lost.`
      : `${displayName} is registered. Moderation has no signing key on this deployment yet, so there is no secret to show.`,
  );
}
