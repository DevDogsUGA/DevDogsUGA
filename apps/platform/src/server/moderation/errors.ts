import type { ReportError } from "@devdogsuga/sdk/moderation";

type Code = ReportError["error"]["code"];

export interface ApiFailure {
  status: number;
  code: Code;
  message: string;
}

const KNOWN: Record<string, ApiFailure> = {
  unknown_client: {
    status: 401,
    code: "unknown_client",
    message: "That client is not registered for moderation",
  },
  unknown_content_type: {
    status: 422,
    code: "unknown_content_type",
    message: "That content type is not registered for this app",
  },
  unknown_user: {
    status: 422,
    code: "unknown_user",
    message: "The reporter or the author is not a platform user",
  },
  reporter_not_allowed: {
    status: 403,
    code: "reporter_not_allowed",
    message: "This account cannot file reports",
  },
  rate_limited: {
    status: 429,
    code: "rate_limited",
    message: "Too many reports filed in the last hour",
  },
  invalid_request: {
    status: 400,
    code: "invalid_request",
    message: "A description is required when the reason is 'other'",
  },
};

/**
 * The SQL functions raise `moderation:<code>` for every failure the API should
 * answer with a 4xx. Drizzle wraps the driver error, so the text can sit on the
 * error or on its cause. Anything else is not ours to explain: null, and the
 * caller lets it surface as a 500 for Sentry.
 */
export function failureFromError(error: unknown): ApiFailure | null {
  for (let cursor: unknown = error, depth = 0; cursor && depth < 4; depth++) {
    const message =
      cursor instanceof Error
        ? cursor.message
        : typeof cursor === "object" && "message" in cursor
          ? String(cursor.message)
          : "";
    const match = /moderation:([a-z_]+)/.exec(message);
    if (match?.[1] && KNOWN[match[1]]) return KNOWN[match[1]]!;
    cursor = cursor instanceof Error ? cursor.cause : undefined;
  }
  return null;
}

/**
 * The text of a database error and of every error it wraps. Drizzle wraps the
 * driver error, so a function's `raise exception` text sits on the cause.
 */
export function raisedMessage(error: unknown): string {
  const messages: string[] = [];
  for (let cursor: unknown = error, depth = 0; cursor && depth < 4; depth++) {
    if (!(cursor instanceof Error)) break;
    messages.push(cursor.message);
    cursor = cursor.cause;
  }
  return messages.join("\n");
}
