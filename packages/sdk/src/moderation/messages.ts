/**
 * The moderation wire format: what an app sends to `/moderation/v1/reports`
 * and what the platform delivers back after a moderator decides.
 *
 * zod is the source. `moderationJsonSchemas()` exports the same shapes as JSON
 * Schema for the spec package, so the two cannot drift.
 */
import { z } from "zod";

// ── Reports (app to platform) ────────────────────────────────────────────────

/** Mirrors the platform's `reportReason` enum. */
export const REPORT_REASONS = [
  "harassment",
  "hate_speech",
  "spam",
  "sexual_content",
  "violence",
  "impersonation",
  "off_topic",
  "other",
] as const;

export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

/**
 * A content type is the app's own name for a kind of thing a member can write
 * (`session`, `profile`). Registered per app on the platform; a report naming
 * an unregistered one is refused.
 */
export const contentTypeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,62}$/, "lowercase letters, digits and underscores");

export const reportRequestSchema = z.object({
  /** The platform user id of the member filing the report. */
  reporterUserId: z.uuid(),
  /** The platform user id of the member who wrote the content. */
  authorUserId: z.uuid(),
  contentType: contentTypeSchema,
  /** The app's own id for the row; opaque to the platform. */
  contentRef: z.string().min(1).max(256),
  /** What the content said when it was reported. Frozen on the report. */
  contentSnapshot: z.string().min(1).max(5000),
  /** A link a moderator can follow to the live content. https only. */
  contentUrl: z
    .url({ protocol: /^https$/ })
    .max(2000)
    .nullish(),
  reason: reportReasonSchema,
  description: z.string().max(1000).nullish(),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

export const reportResponseSchema = z.object({
  reportId: z.uuid(),
  /** True when an open report already existed and this one was added to it. */
  corroborated: z.boolean(),
  /** True when the client is a development client: only its owner sees it. */
  sandbox: z.boolean(),
});
export type ReportResponse = z.infer<typeof reportResponseSchema>;

export const REPORT_ERROR_CODES = [
  "invalid_json",
  "invalid_request",
  "missing_client",
  "unknown_client",
  "client_not_registered",
  "bad_signature",
  "unknown_content_type",
  "unknown_user",
  "reporter_not_allowed",
  "rate_limited",
  "not_configured",
] as const;

export const reportErrorSchema = z.object({
  error: z.object({
    code: z.enum(REPORT_ERROR_CODES),
    message: z.string(),
  }),
});
export type ReportError = z.infer<typeof reportErrorSchema>;

// ── Deliveries (platform to app) ─────────────────────────────────────────────

export const CONTENT_MESSAGE_TYPES = [
  "content.hide",
  "content.remove",
  "content.restore",
] as const;
export const USER_MESSAGE_TYPES = [
  "user.suspend",
  "user.ban",
  "user.restore",
  "user.delete",
] as const;
export const MESSAGE_TYPES = [
  ...CONTENT_MESSAGE_TYPES,
  ...USER_MESSAGE_TYPES,
] as const;

export const contentMessageSchema = z.object({
  type: z.enum(CONTENT_MESSAGE_TYPES),
  /** When the moderator decided, ISO 8601. The ordering key. */
  timestamp: z.iso.datetime(),
  data: z.object({
    contentType: contentTypeSchema,
    contentRef: z.string().min(1).max(256),
    reportId: z.uuid().nullable(),
  }),
});

export const userMessageSchema = z.object({
  type: z.enum(USER_MESSAGE_TYPES),
  timestamp: z.iso.datetime(),
  data: z.object({
    /** The platform user id. Maps to the app's user through the identity. */
    userId: z.uuid(),
    reason: z.string().max(1000).nullable(),
    reportId: z.uuid().nullable(),
  }),
});

export const moderationMessageSchema = z.union([
  contentMessageSchema,
  userMessageSchema,
]);
export type ModerationMessage = z.infer<typeof moderationMessageSchema>;
export type ContentMessage = z.infer<typeof contentMessageSchema>;
export type UserMessage = z.infer<typeof userMessageSchema>;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export function isContentMessage(
  message: ModerationMessage,
): message is ContentMessage {
  return message.type.startsWith("content.");
}

/**
 * What a message is about, for ordering: a decision on one item is only
 * "older" than another decision on the same item.
 */
export function itemKey(message: ModerationMessage): string {
  return isContentMessage(message)
    ? `content:${message.data.contentType}:${message.data.contentRef}`
    : `user:${message.data.userId}`;
}

export function parseMessage(body: string): ModerationMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = moderationMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** The request and message shapes as JSON Schema, for the spec package. */
export function moderationJsonSchemas() {
  return {
    ReportRequest: z.toJSONSchema(reportRequestSchema),
    ReportResponse: z.toJSONSchema(reportResponseSchema),
    ReportError: z.toJSONSchema(reportErrorSchema),
    ModerationMessage: z.toJSONSchema(moderationMessageSchema),
  };
}
