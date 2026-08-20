import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import type { PullRequestEvent } from "~/server/github/prEvent";
import { applyPullRequestEvent } from "~/server/github/pullRequest";

/**
 * POST /github/webhook
 *
 * The PR half of the entry state machine. GitHub tells us a pull request
 * opened, closed, merged or reopened; the team's `submissionState` follows.
 *
 * Nothing here decides consequences. Whether the roster is locked and whether
 * a star was earned are derived from `submissionState` plus time, elsewhere —
 * which is what makes this handler safe to replay and safe to receive out of
 * order.
 */
export async function POST(request: Request) {
  await connection();

  const secret = env.GH_WEBHOOK_SECRET;
  if (!secret) {
    // Refusing is the right default. An unsigned webhook endpoint that writes
    // `submissionState` lets anyone on the internet mark a team as having
    // merged — which awards a star. Accepting unsigned payloads "until the
    // secret is configured" is exactly the window that never gets closed.
    return NextResponse.json(
      { error: "GH_WEBHOOK_SECRET is not set" },
      { status: 503 },
    );
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!signature || !(await verify(secret, body, signature))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  if (request.headers.get("x-github-event") !== "pull_request") {
    // Other events are subscribed to for other reasons or not at all; a 200
    // keeps GitHub from marking the hook as failing.
    return NextResponse.json({ ignored: true });
  }

  const event = parse(body);
  if (!event) {
    return NextResponse.json({ error: "Unparseable payload" }, { status: 400 });
  }

  const outcome = await applyPullRequestEvent(event);
  return NextResponse.json(outcome);
}

/**
 * HMAC-SHA256 over the raw body, compared in constant time.
 *
 * WebCrypto rather than `node:crypto` because this runs on Workers, and
 * `crypto.subtle.verify` is constant-time by construction — a hand-rolled
 * comparison of two hex strings leaks the position of the first differing
 * byte, which is enough to forge a signature given enough attempts.
 */
async function verify(
  secret: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const expected = signature.replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/i.test(expected)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = Number.parseInt(expected.slice(i * 2, i * 2 + 2), 16);
  }

  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(body),
  );
}

interface RawPayload {
  action?: unknown;
  number?: unknown;
  pull_request?: {
    html_url?: unknown;
    merged?: unknown;
    base?: { ref?: unknown };
    head?: { ref?: unknown };
  };
}

function parse(body: string): PullRequestEvent | null {
  let payload: RawPayload;
  try {
    payload = JSON.parse(body) as RawPayload;
  } catch {
    return null;
  }

  const pr = payload.pull_request;
  if (
    typeof payload.action !== "string" ||
    typeof payload.number !== "number" ||
    !pr ||
    typeof pr.html_url !== "string" ||
    typeof pr.base?.ref !== "string" ||
    typeof pr.head?.ref !== "string"
  ) {
    return null;
  }

  return {
    action: payload.action,
    number: payload.number,
    htmlUrl: pr.html_url,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    // Absent on `opened`, and absent is not merged.
    merged: pr.merged === true,
  };
}
