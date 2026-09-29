import { z } from "zod";
import { env } from "~/env";
import { TURNSTILE_ACTION } from "~/lib/support/types";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const siteverifyResponse = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  hostname: z.string().optional(),
  // Real passes carry other metadata (`interactive`), so every key is
  // optional or the parse would refuse them.
  metadata: z
    .object({ result_with_testing_key: z.boolean().optional() })
    .optional(),
});

/**
 * Checks a Turnstile token from the widget with Cloudflare. Run once per
 * guest, before the guest row exists; after that the guest cookie is the
 * proof, and the rate limits carry the rest.
 *
 * Tokens are single-use and expire after five minutes, so a replayed or
 * stale one fails here the same way a forged one does. A pass also has to
 * name our action and the hostname BASE_URL serves, so a token solved for
 * another action, or on another site the widget allows (staging and
 * production share one), is refused. Any failure to reach siteverify fails
 * closed.
 */
export async function verifyTurnstile(
  token: string,
  remoteIp: string | null,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let result;
  try {
    const response = await fetch(SITEVERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    result = siteverifyResponse.safeParse(await response.json());
  } catch {
    return false;
  }
  if (!result.success || !result.data.success) return false;

  // Cloudflare's test secrets pass any token with no action and hostname
  // "example.com". Accepted locally, where they are the default, and
  // nowhere else.
  if (result.data.metadata?.result_with_testing_key) {
    return env.DEPLOY_ENV === "development";
  }
  return (
    result.data.action === TURNSTILE_ACTION &&
    result.data.hostname === new URL(env.BASE_URL).hostname
  );
}
