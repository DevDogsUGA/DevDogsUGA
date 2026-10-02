import { getNavUser, toMeResponse } from "~/components/TopNav/data";
import { isOwnScript } from "~/lib/isOwnScript";

/**
 * The signed-in viewer, for the navbar. Pages render with no user so their
 * HTML can be cached, and the navbar fetches this after hydration
 * (`NavUserProvider`). It returns `null` when signed out.
 *
 * Only for the site's own scripts. It 404s to a navigation, so nobody lands on
 * a page of JSON by typing the URL, and to a cross-site request, so another
 * site's `fetch` learns nothing (the cookie wouldn't ride along under
 * `SameSite=Lax` anyway). That keeps it out of the address bar and out of
 * crawlers (robots.txt also disallows it). It isn't an access control: the
 * session cookie alone decides what it returns.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isOwnScript(request)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(toMeResponse(await getNavUser()), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
