import {
  CLIENT_ID_HEADER,
  reportRequestSchema,
  verifyMessage,
  type ReportError,
  type ReportRequest,
  type ReportResponse,
} from "@devdogsuga/sdk/moderation";
import { failureFromError } from "./errors";
import { deriveClientSecret } from "./secrets";

/**
 * `POST /moderation/v1/reports`, with its collaborators injected so the whole
 * request path (authentication, validation, routing and error mapping) runs
 * under plain Vitest. `store.ts` is the database-backed implementation.
 */
export interface ClientRecord {
  clientId: string;
  secretVersion: number;
  /** Set for a production app, whose reports reach moderators. */
  appId: string | null;
  /**
   * The client's OAuth tier, once the tiers change is in; null before that or
   * when the client has no registration.
   */
  tier?: string | null;
}

export interface ReportApiDeps {
  signingKey: string | undefined;
  findClient(clientId: string): Promise<ClientRecord | null>;
  fileExternal(
    appId: string,
    report: ReportRequest,
  ): Promise<{ reportId: string; corroborated: boolean }>;
  fileSandbox(clientId: string, report: ReportRequest): Promise<string>;
  /** Unix seconds, for the signature window. */
  now?: () => number;
}

/** A report is a few hundred bytes plus a 5,000-character snapshot. */
const MAX_BODY_CHARS = 20_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(
  status: number,
  code: ReportError["error"]["code"],
  message: string,
  headers?: Record<string, string>,
): Response {
  const body: ReportError = { error: { code, message } };
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

export async function handleFileReport(
  request: Request,
  deps: ReportApiDeps,
): Promise<Response> {
  if (!deps.signingKey) {
    return fail(503, "not_configured", "Moderation is not configured here");
  }

  const clientId = request.headers.get(CLIENT_ID_HEADER);
  if (!clientId) {
    return fail(401, "missing_client", `Send the ${CLIENT_ID_HEADER} header`);
  }
  if (!UUID.test(clientId)) {
    return fail(401, "unknown_client", "That client is not registered");
  }

  const body = await request.text();
  if (body.length > MAX_BODY_CHARS) {
    return fail(400, "invalid_request", "The request body is too large");
  }

  const client = await deps.findClient(clientId.toLowerCase());
  if (!client) {
    return fail(401, "unknown_client", "That client is not registered");
  }

  const secret = await deriveClientSecret(
    deps.signingKey,
    client.clientId,
    client.secretVersion,
  );
  const verified = await verifyMessage(secret, request.headers, body, {
    now: deps.now?.(),
  });
  if (!verified.ok) {
    return fail(
      401,
      "bad_signature",
      `The signature was refused: ${verified.reason}`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fail(400, "invalid_json", "The body is not JSON");
  }
  const parsed = reportRequestSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    return fail(400, "invalid_request", issues);
  }

  // A production client nobody registered would file into the sandbox, where no
  // moderator ever sees it. Say so instead of answering 201.
  if (!client.appId && client.tier === "production") {
    return fail(
      403,
      "client_not_registered",
      "This In production app is not registered as a moderation app. An officer registers it in the moderation console",
    );
  }

  try {
    const response: ReportResponse = client.appId
      ? {
          ...(await deps.fileExternal(client.appId, parsed.data)),
          sandbox: false,
        }
      : {
          reportId: await deps.fileSandbox(client.clientId, parsed.data),
          corroborated: false,
          sandbox: true,
        };
    return Response.json(response, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const failure = failureFromError(error);
    if (!failure) throw error;
    return fail(
      failure.status,
      failure.code,
      failure.message,
      failure.status === 429 ? { "retry-after": "3600" } : undefined,
    );
  }
}
