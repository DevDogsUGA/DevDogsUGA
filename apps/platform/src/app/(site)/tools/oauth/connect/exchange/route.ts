import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "~/server/db";
import { oauthConnectCodes } from "~/server/db/schema";
import {
  challengeFromVerifier,
  hashConnectCode,
  sweepExpiredConnectCodes,
} from "~/server/oauth/connectCodes";
import { resolveIssuer } from "~/server/oauth/issuer";
import { ipRateLimitSubject } from "~/server/oauth/ipRateLimitSubject";
import { jsonNoStore } from "~/server/oauth/jsonNoStore";
import { consumeRateLimit } from "~/server/rateLimit";

/**
 * `POST /tools/oauth/connect/exchange` -- the second leg of the `devtools
 * oauth` connect handoff. The CLI's loopback server receives `?code&state`
 * from `~/server/actions/oauthConnect.ts`'s redirect and POSTs the code plus
 * its PKCE verifier here to get the client secret back, which never
 * appeared in a URL.
 *
 * A plain Route Handler on purpose, not a Server Action: Server Actions only
 * work with same-origin form submissions (Next enforces an Origin check on
 * them), and the caller here is a Node CLI process making a bare cross-
 * origin JSON POST with no cookies at all. Route Handlers have no such
 * check, and `~/middleware.ts`'s session refresh is a no-op on a request
 * with no `sb-*` cookie, so nothing in front of this route assumes a
 * browser or a signed-in caller -- the code itself is the credential.
 */

const RATE_LIMIT_SCOPE = "oauth:connect:exchange";
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

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

  const code =
    body !== null &&
    typeof body === "object" &&
    "code" in body &&
    typeof body.code === "string"
      ? body.code
      : "";
  const verifier =
    body !== null &&
    typeof body === "object" &&
    "code_verifier" in body &&
    typeof body.code_verifier === "string"
      ? body.code_verifier
      : "";

  if (!code || !verifier) {
    return jsonNoStore(
      {
        error: "invalid_request",
        error_description: "code and code_verifier are required.",
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

  const codeHash = hashConnectCode(code);

  // Delete-then-validate: the row is gone the instant it is read, whether
  // this request turns out to succeed or not. That is what makes the code
  // single-use without a separate "used" flag or a transaction-level lock --
  // see migration 32's table comment.
  const [claimed] = await db
    .delete(oauthConnectCodes)
    .where(eq(oauthConnectCodes.codeHash, codeHash))
    .returning();

  // Opportunistic cleanup, the exchange route's half -- see
  // `sweepExpiredConnectCodes`'s doc comment. Runs regardless of whether
  // THIS request's own code was found, so a burst of exchange attempts
  // (valid or not) is still enough traffic to keep the table from
  // accumulating abandoned rows.
  await sweepExpiredConnectCodes();

  if (!claimed) {
    return jsonNoStore(
      {
        error: "invalid_grant",
        error_description: "Code is unknown, already used, or expired.",
      },
      { status: 400 },
    );
  }

  if (claimed.expiresAt.getTime() < Date.now()) {
    return jsonNoStore(
      { error: "invalid_grant", error_description: "Code has expired." },
      { status: 400 },
    );
  }

  if (!safeEqual(challengeFromVerifier(verifier), claimed.codeChallenge)) {
    return jsonNoStore(
      {
        error: "invalid_grant",
        error_description: "code_verifier does not match the challenge.",
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
        message: "Failed to resolve OIDC issuer for OAuth connect exchange",
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
