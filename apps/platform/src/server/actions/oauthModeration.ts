"use server";

import { authorizeSession, callerFor, rules } from "~/server/auth/access";
import {
  expected,
  ExpectedFailure,
  failure,
  success,
  type ActionResult,
} from "~/lib/actionResult";

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

import { oauthAuditEvent } from "~/server/oauth/audit";
import { attemptDelivery } from "~/server/moderation/delivery";
import { databaseDeliveryStore } from "~/server/moderation/deliveryStore";
import { endpointUrlProblem } from "~/server/moderation/endpoint";
import { queueDeliveriesQuietly } from "~/server/moderation/queue";
import { deriveClientSecret } from "~/server/moderation/secrets";
import { consumeRateLimit } from "~/server/rateLimit";

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
      ? await callerFor(userId).then(rules.manageOAuthApps)
      : registration.userId === userId;
  return allowed ? registration : null;
}

/**
 * Saves a client's moderation endpoint, the Draft field on the OAuth client
 * page. A rejected URL comes back under `endpointUrl`; the field puts it under
 * its own id. Clearing the URL stops deliveries without turning moderation off.
 * A production client's change is audited in the same transaction.
 */
export async function saveModerationEndpoint(
  clientId: string,
  endpointUrl: string,
): Promise<ActionResult> {
  const access = await authorizeSession();
  if (!access.ok) return access;

  const userId = access.caller.userId;
  const registration = await managedClient(clientId, userId);
  if (!registration) return failure("OAuth client not found");

  const [existing] = await db
    .select()
    .from(moderationClients)
    .where(eq(moderationClients.clientId, clientId));
  if (!existing) return failure("Turn moderation on first");

  const url = endpointUrl.trim();
  const problem = url ? endpointUrlProblem(url) : null;
  if (problem) return failure(problem, { endpointUrl: problem });

  await db.transaction(async (tx) => {
    if (registration.status === "in_production") {
      await tx.insert(auditEvents).values(
        oauthAuditEvent({
          actorUserId: userId,
          action: "oauth_client.moderation_endpoint_changed",
          clientId,
          metadata: { label: registration.label, endpointUrl: url || null },
        }),
      );
    }
    await tx
      .update(moderationClients)
      .set({ endpointUrl: url || null, updatedAt: sql`now()` })
      .where(eq(moderationClients.clientId, clientId));
  });
  revalidatePath("/dashboard/oauth");
  return success(undefined, "Endpoint saved");
}

/**
 * What a moderation Command needs before it acts: the member's id, the client
 * they may manage, whether it is In production, the deployment's signing key
 * and the client's moderation row, if it has one. A client the member may not
 * manage reads as not found.
 */
async function moderationContext(userId: string, clientId: string) {
  const registration = await managedClient(clientId, userId);
  if (!registration) throw new ExpectedFailure("OAuth client not found");
  if (!env.MODERATION_SIGNING_KEY) {
    throw new ExpectedFailure(
      "Moderation is not configured on this deployment yet",
    );
  }
  const [existing] = await db
    .select()
    .from(moderationClients)
    .where(eq(moderationClients.clientId, clientId));
  return {
    registration,
    production: registration.status === "in_production",
    signingKey: env.MODERATION_SIGNING_KEY,
    existing,
  };
}

/**
 * The per-client moderation controls on `/dashboard/oauth`: turn on, rotate
 * the secret and send a test action, one Command each. The endpoint URL is a
 * Draft field and saves through `saveModerationEndpoint`.
 *
 * Every one starts from management rights: a development client must be the
 * signed-in member's own, a production client needs `canManageOAuthApps`. A
 * production client keeps its secret and endpoint controls, audited like the
 * rest of its credentials, so a secret copied wrongly at the Gate can be
 * rotated without a database edit. It cannot be turned on here (registering it
 * in the console does that, and shows the secret once) and cannot send test
 * actions: those would hit the live receiver.
 */

/** The signing secret, shown once: only a version number is stored. */
export interface ModerationSecret {
  secret: string;
}

/** Turns moderation on for a Testing client and shows its secret once. */
export async function enableModeration(
  clientId: string,
  formData: FormData,
): Promise<ActionResult<ModerationSecret>> {
  const access = await authorizeSession();
  if (!access.ok) return access;

  return expected(async () => {
    const { production, signingKey, existing } = await moderationContext(
      access.caller.userId,
      clientId,
    );
    if (production) {
      throw new ExpectedFailure(
        "An app In production is turned on by registering it under Apps Outside the Platform in the console",
      );
    }
    const endpointUrl = field(formData, "endpointUrl");
    const problem = endpointUrl ? endpointUrlProblem(endpointUrl) : null;
    if (problem) throw new ExpectedFailure(problem);

    // The secret is shown once, when moderation is first turned on. A second
    // "enable" must not show it again: the owner rotates to get a new one.
    if (existing) {
      throw new ExpectedFailure(
        "Moderation is already on for this client. Rotate the secret to get a new one",
      );
    }
    await db
      .insert(moderationClients)
      .values({ clientId, endpointUrl: endpointUrl || null })
      .onConflictDoNothing();
    revalidatePath("/dashboard/oauth");
    return { secret: await deriveClientSecret(signingKey, clientId, 1) };
  }, "Moderation is on. Copy the secret now: it is shown once.");
}

/** Rolls a client's signing secret. The audit entry is written in the same transaction. */
export async function rotateModerationSecret(
  clientId: string,
): Promise<ActionResult<ModerationSecret>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const userId = access.caller.userId;

  return expected(async () => {
    const { registration, production, signingKey, existing } =
      await moderationContext(userId, clientId);
    if (!existing) throw new ExpectedFailure("Turn moderation on first");
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
    revalidatePath("/dashboard/oauth");
    return {
      secret: await deriveClientSecret(
        signingKey,
        clientId,
        row?.secretVersion ?? 1,
      ),
    };
  }, "The secret was rotated. The old one stops working now; copy the new one: it is shown once.");
}

/**
 * Sends one real signed delivery to a Testing client's endpoint, once now so
 * the owner sees the receiver's answer. When it did not land the delivery is
 * recorded and the queue keeps trying, and the failure says so.
 */
export async function sendModerationTest(
  clientId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const userId = access.caller.userId;

  const type = field(formData, "type");
  let delivered = "";
  const result = await expected(async (): Promise<undefined> => {
    const { production, signingKey, existing } = await moderationContext(
      userId,
      clientId,
    );
    if (!existing) throw new ExpectedFailure("Turn moderation on first");
    if (production || existing.appId) {
      throw new ExpectedFailure(
        "This client is a registered production app. Test actions only go to apps in Testing",
      );
    }
    if (!existing.endpointUrl) {
      throw new ExpectedFailure("Set an endpoint URL first");
    }

    if (!(MESSAGE_TYPES as readonly string[]).includes(type)) {
      throw new ExpectedFailure("Choose an action");
    }
    const allowed = await consumeRateLimit({
      scope: "moderation:test-action",
      subjectId: userId,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!allowed) {
      throw new ExpectedFailure("Too many test actions. Try again later");
    }

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
    revalidatePath("/dashboard/oauth");
    if (outcome.ack && outcome.result === "delivered") {
      delivered = message.type;
      return;
    }
    if (outcome.ack) {
      throw new ExpectedFailure(
        "The delivery could not be sent. Check the endpoint URL",
      );
    }
    await queueDeliveriesQuietly([row.id]);
    throw new ExpectedFailure(
      `Your endpoint did not accept it (${outcome.error}). It will be retried`,
    );
  });
  return result.ok
    ? success(undefined, `Delivered ${delivered} to your endpoint`)
    : result;
}
