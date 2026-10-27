import type { auditEvents } from "~/server/db/schema";

/**
 * Audit entries for account deletion (`/console/audit-log`).
 *
 * `targetType` is `user` and `targetId` the member's id. The metadata holds
 * ids and flags, never a name or an email: the member is gone by the time the
 * last entry is written, and the log is meant to outlive them (account-deletion
 * Q41). Plain `platform."auditEvents"` inserts, append-only like every other.
 */
export const ACCOUNT_DELETION_AUDIT_ACTIONS = [
  "user.deletion_scheduled",
  "user.deletion_cancelled",
  "user.deleted",
] as const;

export type AccountDeletionAuditAction =
  (typeof ACCOUNT_DELETION_AUDIT_ACTIONS)[number];

export const ACCOUNT_DELETION_TARGET_TYPE = "user";

export function accountDeletionAuditEvent(input: {
  /** The member or officer who did it; null for the job (a system event). */
  actorUserId: string | null;
  action: AccountDeletionAuditAction;
  userId: string;
  metadata: Record<string, string | number | boolean | null>;
  /** Makes the insert idempotent: one entry per (action, target, key). */
  correlationId?: string;
}): typeof auditEvents.$inferInsert {
  return {
    actorType: input.actorUserId === null ? "system" : "user",
    actorUserId: input.actorUserId,
    source: "platform",
    action: input.action,
    targetType: ACCOUNT_DELETION_TARGET_TYPE,
    targetId: input.userId,
    ...(input.correlationId !== undefined && {
      correlationId: input.correlationId,
    }),
    metadata: input.metadata,
  };
}
