import type { db } from "~/server/db";
import { auditEvents } from "~/server/db/schema";

/** The transaction handle the store and report writes share. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** An audit row written in the same transaction as the change it records. */
export async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  targetType: "project" | "projectReport",
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await tx.insert(auditEvents).values({
    actorType: "user",
    actorUserId: actorId,
    source: "platform",
    action,
    targetType,
    targetId,
    metadata,
  });
}
