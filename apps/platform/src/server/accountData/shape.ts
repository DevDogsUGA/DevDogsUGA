/**
 * Shapes the rows of a member's data export (account-deletion Q6).
 *
 * Each function takes a row that belongs to the member and returns only what
 * the member may take with them: no token, secret or hash, and no other
 * person's id. They are plain functions of their inputs so a test can feed
 * them hostile rows. `build.ts` does the reading and calls them.
 */

export const EXPORT_VERSION = 1;

/** The placeholder for another person wherever their id would have been. */
export const ANOTHER_PERSON = "another member";

/** The `identity_data` keys worth returning; the rest is the provider's profile payload. */
const IDENTITY_KEYS = [
  "user_name",
  "preferred_username",
  "name",
  "full_name",
  "email",
] as const;

export function shapeIdentity(row: {
  provider: string;
  createdAt: Date | null;
  lastSignInAt: Date | null;
  identityData: unknown;
}) {
  const data =
    row.identityData !== null && typeof row.identityData === "object"
      ? (row.identityData as Record<string, unknown>)
      : {};
  const account: Record<string, unknown> = {};
  for (const key of IDENTITY_KEYS) {
    const value = data[key];
    if (typeof value === "string") account[key] = value;
  }
  return {
    provider: row.provider,
    linkedAt: row.createdAt,
    lastSignInAt: row.lastSignInAt,
    account,
  };
}

/**
 * A revision of the member's reflection. `createdByUserId` is whoever saved
 * it, which can be an officer correcting it, so it becomes a role, not an id.
 */
export function shapeReflectionRevision(
  row: {
    id: string;
    reflectionId: string;
    meetingId: string;
    content: string;
    submittedAt: Date | null;
    createdAt: Date;
    createdByUserId: string;
    changeReason: string | null;
  },
  memberId: string,
) {
  return {
    id: row.id,
    reflectionId: row.reflectionId,
    meetingId: row.meetingId,
    content: row.content,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    savedBy: row.createdByUserId === memberId ? "you" : "an officer",
    changeReason: row.changeReason,
  };
}

/**
 * A report the member filed. The reported member's id, the snapshot of what
 * they wrote and the reference to it are left out: they describe someone else.
 */
export function shapeFiledReport(row: {
  id: string;
  appId: string;
  contentType: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
}) {
  return {
    id: row.id,
    appId: row.appId,
    contentType: row.contentType,
    reason: row.reason,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

/**
 * An audit event the member caused. Its metadata and target can name someone
 * else (an officer acting on a member), so both are kept only when the target
 * is the member themself.
 */
export function shapeAuditEvent(
  row: {
    id: string;
    createdAt: Date;
    action: string;
    targetType: string;
    targetId: string;
    metadata: unknown;
  },
  memberId: string,
) {
  const aboutMember = row.targetType === "user" && row.targetId === memberId;
  const aboutAnotherMember = row.targetType === "user" && !aboutMember;
  return {
    id: row.id,
    createdAt: row.createdAt,
    action: row.action,
    targetType: row.targetType,
    targetId: aboutAnotherMember ? ANOTHER_PERSON : row.targetId,
    metadata: aboutMember ? row.metadata : null,
  };
}
