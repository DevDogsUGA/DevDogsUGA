/**
 * The CSP nonce, added at the edge rather than at render.
 *
 * vinext refuses to read or write its HTML cache for a request that carries a
 * nonce (`shouldReadAppPageCache` in vinext's `app-page-dispatch.js`), since
 * cached HTML would replay one visitor's nonce to everyone. So pages render
 * with no nonce at all, and this runs on every response on its way out, cache
 * hits included: the Workers Cache stage sits behind the default entrypoint
 * this wraps (`@vinext/cloudflare`'s `cdn-adapter.worker.js`).
 *
 * It mints a fresh nonce, stamps it onto every `<script>` (and every link that
 * preloads one) with `HTMLRewriter`, and replaces the nonce-less CSP middleware
 * set with the matching `'nonce-…' 'strict-dynamic'` policy.
 *
 * Stamping every script is safe only because nothing else can put a
 * `<script>` in the server HTML. React escapes text; the docs compiler fails
 * the build on script in a page (`packages/docs-kit`,
 * `sanitize.ts`); and the handful of server-rendered `dangerouslySetInnerHTML`
 * sites carry fixed scripts, escaped JSON-LD, or generated markup. A new
 * server-rendered `dangerouslySetInnerHTML` of anything a user wrote would
 * break that, so don't add one.
 */
import { CSP_HEADER, generateNonce, serializeCsp } from "@devdogsuga/headers";
import { platformSecurityHeaders } from "~/lib/securityHeaders";

function isHtml(response: Response): boolean {
  const type = response.headers.get("Content-Type") ?? "";
  return type.toLowerCase().startsWith("text/html");
}

/**
 * Bytes this can't read. The Workers runtime compresses on the way out, so an
 * app response is plain text in practice; this only guards against rewriting
 * a body something upstream already encoded.
 */
function isEncoded(response: Response): boolean {
  const encoding = response.headers.get("Content-Encoding");
  return encoding !== null && encoding.toLowerCase() !== "identity";
}

export function withEdgeNonce(response: Response): Response {
  if (!response.body || !isHtml(response) || isEncoded(response)) {
    return response;
  }

  const nonce = generateNonce();
  const stamp = {
    element(element: Element) {
      element.setAttribute("nonce", nonce);
    },
  };
  const rewritten = new HTMLRewriter()
    .on("script", stamp)
    .on('link[rel="modulepreload"]', stamp)
    .on('link[rel="preload"][as="script"]', stamp)
    .transform(response);

  const headers = new Headers(rewritten.headers);
  headers.set(CSP_HEADER, serializeCsp(platformSecurityHeaders(nonce).csp));
  // The rewrite changes the length.
  headers.delete("Content-Length");
  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers,
  });
}
