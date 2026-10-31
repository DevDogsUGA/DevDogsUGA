/**
 * A signed client for the platform's report API, for an app's `report` Edge
 * Function. The member's own session never reaches the platform: the app's
 * backend vouches for the report with the client's secret.
 */
import {
  reportErrorSchema,
  reportRequestSchema,
  reportResponseSchema,
  type ReportError,
  type ReportRequest,
  type ReportResponse,
} from "./messages.js";
import { signMessage } from "./signing.js";

/** Names the OAuth client whose secret signed the request. */
export const CLIENT_ID_HEADER = "moderation-client-id";

export const REPORTS_PATH = "/moderation/v1/reports";
export const REASONS_PATH = "/moderation/v1/reasons";

export class ReportRejectedError extends Error {
  readonly status: number;
  readonly code: ReportError["error"]["code"] | null;
  constructor(
    status: number,
    code: ReportError["error"]["code"] | null,
    message: string,
  ) {
    super(message);
    this.name = "ReportRejectedError";
    this.status = status;
    this.code = code;
  }
}

export interface ModerationClientOptions {
  /** `https://api.devdogsuga.org` (staging: `https://api-staging.devdogsuga.org`). */
  baseUrl: string;
  /** The app's OAuth client id. */
  clientId: string;
  /** The client's `whsec_` signing secret from `/settings/oauth`. */
  secret: string;
  fetch?: typeof fetch;
}

export function createModerationClient(options: ModerationClientOptions) {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");

  return {
    /** Files a report. Throws {@link ReportRejectedError} on a 4xx. */
    async fileReport(request: ReportRequest): Promise<ReportResponse> {
      const body = JSON.stringify(reportRequestSchema.parse(request));
      const headers = await signMessage(options.secret, body);
      const response = await doFetch(`${base}${REPORTS_PATH}`, {
        method: "POST",
        headers: {
          ...headers,
          [CLIENT_ID_HEADER]: options.clientId,
          "content-type": "application/json",
        },
        body,
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) return reportResponseSchema.parse(json);
      const error = reportErrorSchema.safeParse(json);
      throw new ReportRejectedError(
        response.status,
        error.success ? error.data.error.code : null,
        error.success
          ? error.data.error.message
          : `The report API answered ${response.status}`,
      );
    },
  };
}
