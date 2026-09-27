import type { NextRequest } from "next/server";
import { env } from "~/env";
import { db } from "~/server/db";
import { oauthDeviceCodes } from "~/server/db/schema";
import {
  formatUserCode,
  generateDeviceCode,
  generateRawUserCode,
  hashUserCode,
  sweepExpiredDeviceCodes,
} from "~/server/oauth/deviceCodes";
import { ipRateLimitSubject } from "~/server/oauth/ipRateLimitSubject";
import { jsonNoStore } from "~/server/oauth/jsonNoStore";
import { parseRegistrationParams } from "~/server/oauth/registrationParams";
import { consumeRateLimit } from "~/server/rateLimit";

/**
 * `POST /tools/oauth/device/code` -- the first leg of the `devtools oauth`
 * device-code handoff (RFC 8628 §3.2/3.3), for the case a loopback redirect
 * cannot reach the CLI (headless boxes, remote shells, containers with no
 * forwarded port). Mints a `device_code` (the CLI's own secret) and a short
 * `user_code` (what a human confirms at `GET /tools/oauth/device`), same
 * shape as `~/server/oauth/connectCodes.generateConnectCode` but split in
 * two because only one of the pair is ever shown to a person.
 *
 * A plain Route Handler for the same reason
 * `~/app/(site)/tools/oauth/connect/exchange/route.ts` is: the caller is an
 * unauthenticated CLI process, not a signed-in browser.
 */

const RATE_LIMIT_SCOPE = "oauth:device:code";
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

const EXPIRES_IN_SECONDS = 600;
const DEFAULT_INTERVAL_SECONDS = 5;

// Astronomically unlikely to collide (a 43-character base64url device_code,
// or an 8-character user_code drawn from a 20-character alphabet), but the
// table's uniqueness is enforced by a real index -- this retries the insert
// a few times instead of trusting probability alone.
const MAX_INSERT_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore(
      { error: "invalid_request", error_description: "Body must be JSON." },
      { status: 400 },
    );
  }

  const label =
    body !== null &&
    typeof body === "object" &&
    "label" in body &&
    typeof body.label === "string"
      ? body.label
      : "";
  const callbackUri =
    body !== null &&
    typeof body === "object" &&
    "callback_uri" in body &&
    typeof body.callback_uri === "string"
      ? body.callback_uri
      : "";

  const parsed = parseRegistrationParams({ label, callbackUri });
  if (!parsed.ok) {
    return jsonNoStore(
      { error: "invalid_request", error_description: parsed.error },
      { status: 400 },
    );
  }

  const allowed = await consumeRateLimit({
    scope: RATE_LIMIT_SCOPE,
    subjectId: ipRateLimitSubject(request),
    limit: RATE_LIMIT_MAX_ATTEMPTS,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (!allowed) {
    return jsonNoStore(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS) },
      },
    );
  }

  // Opportunistic cleanup, the issuing endpoint's half -- see
  // `sweepExpiredDeviceCodes`'s doc comment.
  await sweepExpiredDeviceCodes();

  let deviceCode: string | undefined;
  let rawUserCode: string | undefined;

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    const { code, codeHash: deviceCodeHash } = generateDeviceCode();
    const candidateUserCode = generateRawUserCode();
    const userCodeHash = hashUserCode(candidateUserCode);

    try {
      await db.insert(oauthDeviceCodes).values({
        deviceCodeHash,
        userCodeHash,
        label: parsed.params.label,
        callbackUri: parsed.params.callbackUri,
        interval: DEFAULT_INTERVAL_SECONDS,
      });
      deviceCode = code;
      rawUserCode = candidateUserCode;
      break;
    } catch (cause) {
      // A unique-index violation on either hash means try again with a
      // fresh pair; anything else is a real failure.
      const message = cause instanceof Error ? cause.message : String(cause);
      if (!message.includes("duplicate key value")) throw cause;
    }
  }

  if (!deviceCode || !rawUserCode) {
    return jsonNoStore(
      {
        error: "invalid_request",
        error_description: "Could not generate a unique device code.",
      },
      { status: 400 },
    );
  }

  const userCode = formatUserCode(rawUserCode);
  const verificationUri = new URL(
    "/tools/oauth/device",
    env.BASE_URL,
  ).toString();
  const verificationUriComplete = new URL(
    `/tools/oauth/device?${new URLSearchParams({ user_code: userCode }).toString()}`,
    env.BASE_URL,
  ).toString();

  return jsonNoStore(
    {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: verificationUriComplete,
      expires_in: EXPIRES_IN_SECONDS,
      interval: DEFAULT_INTERVAL_SECONDS,
    },
    { status: 200 },
  );
}
