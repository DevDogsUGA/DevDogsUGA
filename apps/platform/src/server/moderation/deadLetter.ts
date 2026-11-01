import { and, eq } from "drizzle-orm";
import { postAlert } from "~/server/alerts";
import { db } from "~/server/db";
import { apps, moderationDeliveries } from "~/server/db/schema";

/**
 * A delivery that exhausted its retries. Marks it failed (unless it was
 * delivered in the meantime) and alerts. `postAlert` never throws.
 */
export async function markDeadLettered(deliveryId: string): Promise<void> {
  const [row] = await db
    .update(moderationDeliveries)
    .set({ status: "failed" })
    .where(
      and(
        eq(moderationDeliveries.id, deliveryId),
        eq(moderationDeliveries.status, "pending"),
      ),
    )
    .returning({
      type: moderationDeliveries.type,
      appId: moderationDeliveries.appId,
      attempts: moderationDeliveries.attempts,
      lastError: moderationDeliveries.lastError,
      sandbox: moderationDeliveries.sandbox,
    });
  // Already delivered, already failed, or gone: nothing to raise.
  if (!row) return;
  // A development client's endpoint is a member's own work in progress. Its
  // failure belongs to the member (the console and /settings/oauth show it), not
  // to the officers' alert path.
  if (row.sandbox) return;

  const [app] = row.appId
    ? await db
        .select({ displayName: apps.displayName })
        .from(apps)
        .where(eq(apps.id, row.appId))
    : [];

  await postAlert(
    "A moderation delivery was dead-lettered",
    [
      `App: ${app?.displayName ?? "unknown"}`,
      `Message: ${row.type}`,
      `Attempts: ${row.attempts}`,
      `Last error: ${row.lastError ?? "none recorded"}`,
      `Delivery: ${deliveryId}`,
    ],
    "Fix the app's endpoint, then resend it from the report in the moderation console.",
  );
}
