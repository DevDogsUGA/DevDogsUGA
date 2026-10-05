/**
 * `curl devdogsuga.org/<path>` gets a terminal page instead of HTML.
 *
 * Decided here, at the edge, rather than in middleware. vinext's page cache
 * keys on the URL, so a middleware rewrite that answered curl and browsers
 * differently at the same URL could leave one client's response in the other's
 * cache entry. Forwarding to a different URL (`/terminal/<path>`) before vinext
 * runs keeps the two apart, and the forwarded request still goes through
 * vinext, so the terminal routes get the same request context, loaders and
 * middleware as every page. The idea is borrowed from ysap.sh
 * (github.com/bahamas10/ysap), which does the same for curl in nginx.
 *
 * Paths the terminal doesn't know pass through untouched, so curl against an
 * API route or `/events/calendar.ics` behaves exactly as before. Only when the
 * app answers one of them with its HTML 404 does the terminal step back in, so
 * a mistyped path prints a terminal 404 rather than a page of markup.
 */
import {
  matchTerminalPath,
  TERMINAL_PREFIX,
  terminalFormat,
  type TerminalFormat,
} from "~/terminal/paths";

function forward(request: Request, format: TerminalFormat): Request {
  const url = new URL(request.url);
  url.pathname = `${TERMINAL_PREFIX}${url.pathname === "/" ? "" : url.pathname}`;
  url.searchParams.set("format", format === "plain" ? "txt" : "ansi");
  return new Request(url, { method: request.method, headers: request.headers });
}

/**
 * The response for a terminal client, or null to let the request through
 * as-is.
 */
export async function serveTerminal(
  request: Request,
  app: (request: Request) => Promise<Response>,
): Promise<Response | null> {
  const format = terminalFormat(request);
  if (!format) return null;
  const { pathname } = new URL(request.url);
  if (
    pathname === TERMINAL_PREFIX ||
    pathname.startsWith(`${TERMINAL_PREFIX}/`)
  ) {
    return null;
  }
  if (matchTerminalPath(pathname)) return app(forward(request, format));

  const response = await app(request);
  const html = (response.headers.get("content-type") ?? "").includes(
    "text/html",
  );
  if (response.status !== 404 || !html) return response;
  await response.body?.cancel();
  return app(forward(request, format));
}
