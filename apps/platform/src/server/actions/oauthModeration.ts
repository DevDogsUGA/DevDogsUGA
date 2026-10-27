"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import {
  MESSAGE_TYPES,
  buildMessage,
  type MessageType,
} from "@devdogsuga/sdk/moderation";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  auditEvents,
  moderationClients,
  moderationDeliveries,
} from "~/server/db/schema";
import { expectSession } from "~/server/auth";
import { canUserManageOAuthApps } from "~/server/actions/permissions";
import { oauthAuditEvent } from "~/server/oauth/audit";
import { attemptDelivery } from "~/server/moderation/delivery";
import { databaseDeliveryStore } from "~/server/moderation/deliveryStore";
import { endpointUrlProblem } from "~/server/moderation/endpoint";
import { queueDeliveriesQuietly } from "~/server/moderation/queue";
import { deriveClientSecret } from "~/server/moderation/secrets";
import { consumeRateLimit } from "~/server/rateLimit";

export type OAuthModerationState = {
  clientId: string | null;
  /** Shown once: only a version number is stored, but the page never re-derives it. */
  secret: string | null;
  message: string | null;
  ok: boolean;
};

const EMPTY: OAuthModerationState = {
  clientId: null,
  secret: null,
  message: null,
  ok: true,
};

const fail = (message: string): OAuthModerationState => ({
  ...EMPTY,
  ok: false,
  message,
});

const field = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};

/**
 * The registration of a client `userId` may manage, or null.
 *
 * A Testing app belongs to whoever registered it; an app that is In production
 * (or a DevDogs app) is managed by everyone who holds `canManageOAuthApps`,
 * whoever registered it. Anyone else gets the "not
 * found" they would get for an id that does not exist.
 */
async function managedClient(clientId: string, userId: string) {
  const registration = await db.query.oauthRegistrations.findFirst({
    columns: { clientId: true, userId: true, status: true, label: true },
    where: { clientId },
  });
  if (!registration) return null;
  const allowed =
    registration.status === "in_production" || registration.userId === null
      ? await canUserManageOAuthApps(userId)
      : registration.userId === userId;
  return allowed ? registration : null;
}

/**
 * The per-client moderation controls on `/tools/oauth`.
 *
 * Every intent starts from management rights: a development client must be the
 * signed-in member's own, a production client needs `canManageOAuthApps`. A
 * production client keeps its secret and endpoint controls, audited like the
 * rest of its credentials, so a secret copied wrongly at the Gate can be
 * rotated without a database edit. It cannot be turned on here (registering it
 * in the console does that, and shows the secret once) and cannot send test
 * actions: those would hit the live receiver.
 */
export default async function oauthModerationAction(
  _previous: OAuthModerationState,
  formData: FormData,
): Promise<OAuthModerationState> {
  const userId = await expectSession();
  const intent = field(formData, "intent");
  const clientId = field(formData, "clientId");

  const registration = await managedClient(clientId, userId);
  if (!registration) return fail("OAuth client not found");
  const production = registration.status === "in_production";
  if (!env.MODERATION_SIGNING_KEY) {
    return fail("Moderation is not configured on this deployment yet");
  }
  const signingKey = env.MODERATION_SIGNING_KEY;

  const [existing] = await db
    .select()
    .from(moderationClients)
    .where(eq(moderationClients.clientId, clientId));

  switch (intent) {
    case "enable": {
      if (production) {
        return fail(
          "An app In production is turned on by registering it under Apps Outside the Platform in the console",
        );
      }
      const endpointUrl = field(formData, "endpointUrl");
      const problem = endpointUrl ? endpointUrlProblem(endpointUrl) : null;
      if (problem) return fail(problem);

      // The secret is shown once, when moderation is first turned on. A second
      // "enable" must not show it again: the owner rotates to get a new one.
      if (existing) {
        return fail(
          "Moderation is already on for this client. Rotate the secret to get a new one",
        );
      }
      await db
        .insert(moderationClients)
        .values({ clientId, endpointUrl: endpointUrl || null })
        .onConflictDoNothing();
      revalidatePath("/settings/oauth");
      return {
        ...EMPTY,
        clientId,
        secret: await deriveClientSecret(signingKey, clientId, 1),
        message: "Moderation is on. Copy the secret now: it is shown once.",
      };
    }

    case "set-endpoint": {
      if (!existing) return fail("Turn moderation on first");
      const endpointUrl = field(formData, "endpointUrl");
      const problem = endpointUrl ? endpointUrlProblem(endpointUrl) : null;
      if (problem) return fail(problem);
      await db.transaction(async (tx) => {
        if (production) {
          await tx.insert(auditEvents).values(
            oauthAuditEvent({
              actorUserId: userId,
              action: "oauth_client.moderation_endpoint_changed",
              clientId,
              metadata: {
                label: registration.label,
                endpointUrl: endpointUrl || null,
              },
            }),
          );
        }
        await tx
          .update(moderationClients)
          .set({ endpointUrl: endpointUrl || null, updatedAt: sql`now()` })
          .where(eq(moderationClients.clientId, clientId));
      });
      revalidatePath("/settings/oauth");
      return { ...EMPTY, message: "Endpoint saved" };
    }

    case "rotate-secret": {
      if (!existing) return fail("Turn moderation on first");
      // The audit entry goes in first, in the same transaction: a rotation is
      // never made without a record, and one that fails leaves none.
      const [row] = await db.transaction(async (tx) => {
        if (production) {
          await tx.insert(auditEvents).values(
            oauthAuditEvent({
              actorUserId: userId,
              action: "oauth_client.moderation_secret_rotated",
              clientId,
              metadata: {
                label: registration.label,
                secretVersion: existing.secretVersion + 1,
              },
            }),
          );
        }
        return tx
          .update(moderationClients)
          .set({
            secretVersion: sql`${moderationClients.secretVersion} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(moderationClients.clientId, clientId))
          .returning({ secretVersion: moderationClients.secretVersion });
      });
      revalidatePath("/settings/oauth");
      return {
        ...EMPTY,
        clientId,
        secret: await deriveClientSecret(
          signingKey,
          clientId,
          row?.secretVersion ?? 1,
        ),
        message:
          "The secret was rotated. The old one stops working now; copy the new one: it is shown once.",
      };
    }

    case "send-test": {
      if (!existing) return fail("Turn moderation on first");
      if (production || existing.appId) {
        return fail(
          "This client is a registered production app. Test actions only go to apps in Testing",
        );
      }
      if (!existing.endpointUrl) return fail("Set an endpoint URL first");

      const type = field(formData, "type");
      if (!(MESSAGE_TYPES as readonly string[]).includes(type)) {
        return fail("Choose an action");
      }
      const allowed = await consumeRateLimit({
        scope: "moderation:test-action",
        subjectId: userId,
        limit: 30,
        windowSeconds: 3600,
      });
      if (!allowed) return fail("Too many test actions. Try again later");

      const message = buildMessage({
        type: type as MessageType,
        contentType: field(formData, "contentType") || undefined,
        contentRef: field(formData, "contentRef") || undefined,
        // A user action about the owner themselves, so it maps to an account
        // they control in the app.
        userId,
      });
      const [row] = await db
        .insert(moderationDeliveries)
        .values({
          clientId,
          type: message.type,
          payload: message,
          sandbox: true,
        })
        .returning({ id: moderationDeliveries.id });
      if (!row) throw new Error("The test delivery was not recorded");

      // One attempt now, so the owner sees the receiver's answer instead of a
      // promise; if it did not land, the queue keeps trying.
      const outcome = await attemptDelivery(row.id, {
        store: databaseDeliveryStore,
        signingKey,
      });
      revalidatePath("/settings/oauth");
      if (outcome.ack && outcome.result === "delivered") {
        return {
          ...EMPTY,
          message: `Delivered ${message.type} to your endpoint`,
        };
      }
      if (outcome.ack) {
        return fail("The delivery could not be sent. Check the endpoint URL");
      }
      await queueDeliveriesQuietly([row.id]);
      return fail(
        `Your endpoint did not accept it (${outcome.error}). It will be retried`,
      );
    }

    default:
      return fail("Unknown action");
  }
}
