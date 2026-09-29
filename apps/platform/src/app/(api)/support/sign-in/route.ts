import type { NextRequest } from "next/server";
import { requestAuthorization } from "~/server/auth/providers/google";

/**
 * GET /support/sign-in?next=/docs/...
 *
 * The widget's plain "Sign in" step, for fallbacks that only need an
 * account (not Discord). A link rather than the site's sign-in form action,
 * because the widget renders it as an anchor inside rendered messages.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("next") ?? "/docs";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/docs";
  return requestAuthorization(next);
}
