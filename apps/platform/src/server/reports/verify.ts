import { createHmac } from "crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "~/server/db";
import { contentReports } from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";

const MAX_ATTEMPTS = 5;

const BACKOFF_MS = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  8 * 60 * 60 * 1000,
];

const BATCH_SIZE = 50;

export interface VerifyWebhookPayload {
  event: "report.verify";
  reportId: string;
  reporterUserId: string;
  reportedUserId: string;
  contentId: string;
  contentType: { id: string; label: string } | null;
  contentSnapshot: string;
  contentUrl: string | null;
  reason: { id: string; title: string; description: string | null } | null;
  description: string | null;
}

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

function signPayload(secret: string, body: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

export async function verifyPendingReports(): Promise<void> {
  const reports = await db
    .select()
    .from(contentReports)
    .where(
      and(
        eq(contentReports.status, "unverified"),
        isNull(contentReports.nextVerifyAt),
      ),
    )
    .limit(BATCH_SIZE);

  const overdue = await db
    .select()
    .from(contentReports)
    .where(
      and(
        eq(contentReports.status, "unverified"),
        lt(contentReports.nextVerifyAt, new Date()),
      ),
    )
    .limit(BATCH_SIZE - reports.length);

  await Promise.allSettled(
    [...reports, ...overdue].map(deliverVerifyWebhook),
  );
}

async function deliverVerifyWebhook(
  report: typeof contentReports.$inferSelect,
): Promise<void> {
  const registration = await db.query.oauthRegistrations.findFirst({
    where: { clientId: report.clientId },
  });

  if (!registration?.reportWebhookUrl) {
    await db
      .update(contentReports)
      .set({ status: "pending" })
      .where(eq(contentReports.id, report.id));
    return;
  }

  const [reason, contentType] = await Promise.all([
    db.query.reportReasons.findFirst({
      where: { id: report.reasonId },
      columns: { id: true, title: true, description: true },
    }),
    report.contentTypeId
      ? db.query.reportContentTypes.findFirst({
          where: { id: report.contentTypeId },
          columns: { id: true, label: true },
        })
      : Promise.resolve(null),
  ]);

  const payload: VerifyWebhookPayload = {
    event: "report.verify",
    reportId: report.id,
    reporterUserId: report.reporterUserId,
    reportedUserId: report.reportedUserId,
    contentId: report.contentId,
    contentType: contentType ?? null,
    contentSnapshot: report.contentSnapshot,
    contentUrl: report.contentUrl ?? null,
    reason: reason
      ? {
          id: reason.id,
          title: reason.title,
          description: reason.description ?? null,
        }
      : null,
    description: report.description ?? null,
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

  let status: number;
  try {
    const res = await fetch(registration.reportWebhookUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
  } catch {
    status = 0;
  }

  if (status >= 200 && status < 300) {
    await db
      .update(contentReports)
      .set({ status: "pending", verifyAttempts: report.verifyAttempts + 1 })
      .where(eq(contentReports.id, report.id));
  } else if (status >= 400 && status < 500) {
    await db.delete(contentReports).where(eq(contentReports.id, report.id));
  } else {
    const nextAttempt = report.verifyAttempts + 1;
    if (nextAttempt >= MAX_ATTEMPTS) {
      await db.delete(contentReports).where(eq(contentReports.id, report.id));
    } else {
      await db
        .update(contentReports)
        .set({
          verifyAttempts: nextAttempt,
          nextVerifyAt: new Date(
            Date.now() + (BACKOFF_MS[report.verifyAttempts] ?? 0),
          ),
        })
        .where(eq(contentReports.id, report.id));
    }
  }
}
