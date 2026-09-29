import { z } from "zod";
import { env } from "~/env";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const siteverifyResponse = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).default([]),
});

/**
 * Checks a Turnstile token from the widget with Cloudflare. Run once per
 * guest, before the guest row exists; after that the guest cookie is the
 * proof, and the rate limits carry the rest.
 *
 * Tokens are single-use and expire after five minutes, so a replayed or
 * stale one fails here the same way a forged one does.
 */
export async function verifyTurnstile(
  token: string,
  remoteIp: string | null,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch(SITEVERIFY, { method: "POST", body });
  if (!response.ok) return false;
  const result = siteverifyResponse.safeParse(await response.json());
  return result.success && result.data.success;
}
