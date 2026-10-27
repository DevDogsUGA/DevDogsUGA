import type { NextRequest } from "next/server";
import { handleGithubWebhook } from "~/server/contributions/webhook";

/**
 * POST /github/webhook
 *
 * The Payload URL of the read-only GitHub App (devdogs-platform, and its
 * staging twin). Subscribed to `pull_request` only; merged pull requests land
 * in `platform.contributions`. Authenticated by the HMAC signature alone, so
 * it carries no session and the middleware has nothing to add.
 */
export async function POST(request: NextRequest) {
  return handleGithubWebhook(request);
}
