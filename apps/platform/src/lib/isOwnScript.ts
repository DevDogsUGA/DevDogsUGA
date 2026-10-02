/**
 * True when a request looks like the site's own `fetch`, not a navigation or
 * another site's script. Route handlers that serve JSON only for the page's
 * own scripts (`/me`, `/attendance/ongoing`) 404 to anything else, so nobody
 * lands on a page of JSON by typing the URL and a cross-site `fetch` learns
 * nothing. Not an access control.
 */
export function isOwnScript(request: Request): boolean {
  const headers = request.headers;
  if (headers.get("Sec-Fetch-Mode") === "navigate") return false;
  if (headers.get("Sec-Fetch-Dest") === "document") return false;
  // Absent in old browsers and non-browser clients; only a present,
  // cross-site value is refused.
  const site = headers.get("Sec-Fetch-Site");
  return site === null || site === "same-origin";
}
