import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "~/server/db";
import { oauthDeviceCodes } from "~/server/db/schema";
import {
  hashDeviceCode,
  sweepExpiredDeviceCodes,
} from "~/server/oauth/deviceCodes";
import { resolveIssuer } from "~/server/oauth/issuer";
import { ipRateLimitSubject } from "~/server/oauth/ipRateLimitSubject";
import { jsonNoStore } from "~/server/oauth/jsonNoStore";
import { consumeRateLimit } from "~/server/rateLimit";

/**
 * `POST /tools/oauth/device/token` -- the polling leg of the `devtools
 * oauth` device-code handoff (RFC 8628 §3.4/3.5). The CLI calls this with
 * the `device_code` `POST /tools/oauth/device/code` minted, on the
 * `interval` it was given, until a human has approved or denied the
 * request at `GET /tools/oauth/device`.
 *
 * Plain Route Handler for the same reason the connect exchange and the
 * device code-issuing endpoint are: an unauthenticated CLI process, no
 * cookies, no Origin a Server Action could check.
 */

const RATE_LIMIT_SCOPE = "oauth:device:token";
// Generous relative to the 5s (and up) polling interval this endpoint
// itself hands out -- one IP polling a single code every 5 seconds is 12
// requests/min, so 60/min comfortably covers a few devices behind the same
// NAT without opening the door to a tight guessing loop.
const RATE_LIMIT_MAX_ATTEMPTS = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// RFC 8628 §3.5: bump the interval by this many seconds every time a poll
// arrives sooner than the row's current interval since its last poll.
const SLOW_DOWN_INCREMENT_SECONDS = 5;

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

  const deviceCode =
    body !== null &&
    typeof body === "object" &&
    "device_code" in body &&
    typeof body.device_code === "string"
      ? body.device_code
      : "";

  if (!deviceCode) {
    return jsonNoStore(
      {
        error: "invalid_request",
        error_description: "device_code is required.",
      },
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

  const deviceCodeHash = hashDeviceCode(deviceCode);

  // A plain lookup, not delete-then-validate -- unlike the connect exchange
  // (and unlike this same code once it is *approved*, below), a pending row
  // has to survive being read: it will be polled again.
  const row = await db.query.oauthDeviceCodes.findFirst({
    where: { deviceCodeHash },
  });

  if (!row) {
    // Opportunistic cleanup for every OTHER abandoned code, same as the
    // connect exchange -- see `sweepExpiredDeviceCodes`'s doc comment.
    await sweepExpiredDeviceCodes();
    return jsonNoStore(
      {
        error: "invalid_grant",
        error_description: "device_code is unknown or already used.",
      },
      { status: 400 },
    );
  }

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(oauthDeviceCodes).where(eq(oauthDeviceCodes.id, row.id));
    return jsonNoStore(
      { error: "expired_token", error_description: "device_code has expired." },
      { status: 400 },
    );
  }

  if (row.status === "denied") {
    await db.delete(oauthDeviceCodes).where(eq(oauthDeviceCodes.id, row.id));
    return jsonNoStore(
      {
        error: "access_denied",
        error_description: "The request was denied.",
      },
      { status: 400 },
    );
  }

  if (row.status === "approved") {
    // Delete-then-validate: the row (and the client secret it holds) is
    // claimed the instant it is read, race-free the same way the connect
    // exchange's is -- a second poll that arrives while this one is still
    // in flight finds nothing and gets `invalid_grant`, not a second copy
    // of the secret.
    const [claimed] = await db
      .delete(oauthDeviceCodes)
      .where(eq(oauthDeviceCodes.id, row.id))
      .returning();

    if (!claimed?.clientId || !claimed.clientSecret) {
      return jsonNoStore(
        {
          error: "invalid_grant",
          error_description: "device_code is unknown or already used.",
        },
        { status: 400 },
      );
    }

    let issuer: string;
    try {
      issuer = await resolveIssuer();
    } catch (cause) {
      console.error(
        JSON.stringify({
          message: "Failed to resolve OIDC issuer for OAuth device token",
          error: cause instanceof Error ? cause.message : String(cause),
        }),
      );
      return jsonNoStore(
        {
          error: "invalid_request",
          error_description: "Could not resolve the platform's OIDC issuer.",
        },
        { status: 400 },
      );
    }

    return jsonNoStore(
      {
        client_id: claimed.clientId,
        client_secret: claimed.clientSecret,
        issuer,
      },
      { status: 200 },
    );
  }

  // status === "pending"
  const now = new Date();
  const tooSoon =
    row.lastPolledAt !== null &&
    now.getTime() - row.lastPolledAt.getTime() < row.interval * 1000;

  if (tooSoon) {
    const nextInterval = row.interval + SLOW_DOWN_INCREMENT_SECONDS;
    await db
      .update(oauthDeviceCodes)
      .set({ interval: nextInterval, lastPolledAt: now })
      .where(eq(oauthDeviceCodes.id, row.id));

    return jsonNoStore({ error: "slow_down" }, { status: 400 });
  }

  await db
    .update(oauthDeviceCodes)
    .set({ lastPolledAt: now })
    .where(eq(oauthDeviceCodes.id, row.id));

  // Opportunistic cleanup, the token endpoint's half -- see
  // `sweepExpiredDeviceCodes`'s doc comment.
  await sweepExpiredDeviceCodes();

  return jsonNoStore({ error: "authorization_pending" }, { status: 400 });
}
