import { createHmac } from "crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "~/server/db";
import { reportContentTypes, reportResolutions } from '~/server/db/schema';
import { supabaseAdmin } from "~/supabase/admin";

/** Maximum number of delivery attempts before giving up. */
const MAX_ATTEMPTS = 5;

/**
 * Exponential backoff delays in milliseconds for each retry attempt.
 * Attempt 0 = first retry after initial failure (1 minute), up to 8 hours.
 */
const BACKOFF_MS = [
  1 * 60 * 1000, // 1 min
  5 * 60 * 1000, // 5 min
  30 * 60 * 1000, // 30 min
  2 * 60 * 60 * 1000, // 2 h
  8 * 60 * 60 * 1000, // 8 h
];

export interface WebhookPayload {
  event: "report.resolved";
  reportId: string;
  reportedUserId: string;
  reporterUserId: string;
  contentId: string;
  contentTypeLabel: string | null;
  subjectAction: string;
  filerAction: string;
  contentAction: string;
  resolvedAt: string;
}

/**
 * Retrieves the webhook signing secret for a client from Supabase Vault.
 * Returns `null` if no secret ID is stored for this registration.
 *
 * The `vault` schema is not included in the generated Supabase types, so we
 * use `supabaseAdmin` cast to `any` for this query only.
 */
async function getWebhookSecret(secretId: string): Promise<string | null> {
  // The `vault` schema is not included in the generated Supabase types.
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", secretId)
    .single();
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

  if (error || !data) return null;
  return (data as { decrypted_secret: string }).decrypted_secret;
}

/**
 * Signs a serialized JSON payload with HMAC-SHA256 using the provided secret.
 * The signature format matches GitHub's webhook signature scheme:
 * `sha256=<hex-digest>`
 */
function signPayload(secret: string, body: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

/**
 * Attempts to deliver the webhook for the given resolution.
 *
 * On success (2xx): sets `notifiedAt = now()`.
 * On failure: increments `webhookAttempts` and schedules the next retry via
 * `nextRetryAt` using exponential backoff. After `MAX_ATTEMPTS` failures the
 * record is left with `nextRetryAt = null` so the cron job stops retrying;
 * the client can still poll `GET /api/reports/[id]` for the resolution.
 */
export async function deliverWebhook(resolutionId: string): Promise<void> {
  const resolution = await db.query.reportResolutions.findFirst({
    where: { id: resolutionId },
    with: { report: true },
  });

  if (!resolution) return;

  const [registration, contentTypeRow] = await Promise.all([
    db.query.oauthRegistrations.findFirst({
      where: { clientId: resolution.report.clientId },
    }),
    resolution.report.contentTypeId
      ? db.query.reportContentTypes.findFirst({
          where: { id: resolution.report.contentTypeId },
          columns: { label: true },
        })
      : Promise.resolve(null),
  ]);

  if (!registration?.reportWebhookUrl) return;

  const payload: WebhookPayload = {
    event: "report.resolved",
    reportId: resolution.reportId,
    reportedUserId: resolution.report.reportedUserId,
    reporterUserId: resolution.report.reporterUserId,
    contentId: resolution.report.contentId,
    contentTypeLabel: contentTypeRow?.label ?? null,
    subjectAction: resolution.subjectAction,
    filerAction: resolution.filerAction,
    contentAction: resolution.contentAction,
    resolvedAt: (resolution.report.resolvedAt ?? new Date()).toISOString(),
  };

  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "DevDogs-Webhook/1.0",
  };

  if (registration.reportWebhookSecretId) {
    const secret = await getWebhookSecret(registration.reportWebhookSecretId);
    if (secret) {
      headers["X-DevDogs-Signature"] = signPayload(secret, body);
    }
  }

  let succeeded = false;
  try {
    const res = await fetch(registration.reportWebhookUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000), // 10 s timeout
    });
    succeeded = res.ok;
  } catch {
    succeeded = false;
  }

  if (succeeded) {
    await db
      .update(reportResolutions)
      .set({ notifiedAt: new Date() })
      .where(eq(reportResolutions.id, resolutionId));
    return;
  }

  // Delivery failed — schedule retry or give up.
  const nextAttempt = resolution.webhookAttempts + 1;
  const backoffDelay = BACKOFF_MS[resolution.webhookAttempts] ?? 0;
  const nextRetryAt =
    nextAttempt < MAX_ATTEMPTS ? new Date(Date.now() + backoffDelay) : null; // permanently failed

  await db
    .update(reportResolutions)
    .set({
      webhookAttempts: nextAttempt,
      nextRetryAt,
    })
    .where(eq(reportResolutions.id, resolutionId));
}

/**
 * Fetches all resolutions that are due for a retry and delivers their webhooks.
 * Called by the cron job at `GET /api/cron/deliver-webhooks`.
 */
export async function retryPendingWebhooks(): Promise<void> {
  const now = new Date();

  const pending = await db
    .select({ id: reportResolutions.id })
    .from(reportResolutions)
    .where(
      and(
        isNull(reportResolutions.notifiedAt),
        lt(reportResolutions.nextRetryAt, now),
        lt(reportResolutions.webhookAttempts, MAX_ATTEMPTS),
      ),
    );

  await Promise.all(pending.map(({ id }) => deliverWebhook(id)));
}
