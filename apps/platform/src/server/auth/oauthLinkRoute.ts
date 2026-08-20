import type { NextRequest } from "next/server";
import { authenticate } from "~/server/auth";
import { callbackPathSchema } from "~/server/utils";

/**
 * The GET handler behind `/auth`. `/join` shared it until that route became a
 * redirect to the Involvement Network; point it back here to restore sign-up.
 *
 * The route *starts* an OAuth flow — it mints a PKCE challenge, writes the
 * `sb-<ref>-auth-token-code-verifier` cookie and redirects to Google — so it
 * is state-changing despite being a GET. `<Link>` prefetches it like any
 * other route, which meant every page view silently began two handshakes
 * before the visitor clicked anything.
 *
 * The call sites pass `prefetch={false}`; this guard is what keeps a future
 * link from quietly reintroducing it. Answering RSC requests with 204 costs
 * nothing, because the redirect target is cross-origin: the router could never
 * have consumed the response, so it always fell back to a hard navigation and
 * started the handshake a second time anyway.
 */
export async function startOAuthFromLink(
  request: NextRequest,
): Promise<Response> {
  if (request.headers.get("RSC") === "1") {
    return new Response(null, { status: 204 });
  }

  const raw = request.nextUrl.searchParams.get("callbackPath");
  const callbackPath = raw
    ? await callbackPathSchema.parseAsync(raw).catch(() => "/")
    : "/";

  return await authenticate("google", callbackPath);
}
