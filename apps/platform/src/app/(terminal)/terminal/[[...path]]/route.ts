import { terminalResponse } from "~/terminal/handler";

/**
 * The terminal versions of the site's pages, as plain text with ANSI colour.
 *
 * Nobody types this path. The Worker entry (`cloudflare/worker.ts`) forwards a
 * curl request for `/events` here as `/terminal/events` before vinext sees it,
 * so the browser's `/events` and its page cache are never involved, and the
 * route still runs inside vinext's request context, where the loaders and
 * their per-request database client work. Opening it directly works too, which
 * is handy for `?format=txt` in a browser tab.
 */
export function GET(request: Request): Promise<Response> {
  return terminalResponse(request);
}

export function HEAD(request: Request): Promise<Response> {
  return terminalResponse(request);
}
