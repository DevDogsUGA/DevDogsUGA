import { NextResponse } from "next/server";
import { env } from "~/env";
import { parsePullRequestEvent, type MergedPullRequest } from "./pullRequest";
import { verifyGithubSignature } from "./signature";
import { recordContribution } from "./store";

/** What the handler needs from outside; tests replace both. */
/** GitHub's own cap on a webhook payload, 25 MB; nothing larger is genuine. */
export const MAX_WEBHOOK_BYTES = 25 * 1024 * 1024;

export interface WebhookDeps {
  secret?: string | undefined;
  org?: string;
  record?: (
    pr: MergedPullRequest,
    deliveryId: string | null,
  ) => Promise<"recorded" | "duplicate">;
}

/**
 * POST /github/webhook, the read-only GitHub App's delivery endpoint.
 *
 * 503 without `GH_WEBHOOK_SECRET` (GitHub retries, and nothing is accepted
 * unsigned). 401 for a missing or wrong signature, checked over the raw body
 * before anything is parsed. After that every delivery is answered 2xx, so a
 * delivery we do not care about is never retried: only a merged pull request
 * in the organization is recorded.
 */
export async function handleGithubWebhook(
  request: Request,
  deps: WebhookDeps = {},
): Promise<NextResponse> {
  const secret = "secret" in deps ? deps.secret : env.GH_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Refuse an oversized body before buffering and hashing it.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGithubSignature(secret, rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event");
  if (eventName === "ping") return NextResponse.json({ ok: "pong" });
  if (eventName !== "pull_request") {
    return NextResponse.json({ ignored: `event ${eventName ?? "none"}` });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ignored: "unrecognised payload" });
  }

  const parsed = parsePullRequestEvent(payload, deps.org ?? env.GITHUB_ORG);
  if (parsed.kind === "ignored") {
    return NextResponse.json({ ignored: parsed.reason });
  }

  const deliveryId = request.headers.get("x-github-delivery");
  const result = await (deps.record ?? recordContribution)(
    parsed.pullRequest,
    deliveryId,
  );
  return NextResponse.json({ [result]: true });
}
