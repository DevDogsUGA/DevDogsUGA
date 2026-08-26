import type { MetadataRoute } from "next";
import { env } from "~/env";

/**
 * /robots.txt
 *
 * The disallow list below is the complement of what `sitemap.ts` names, worked
 * out against the route tree rather than from memory — every entry is a real
 * first segment under `app/(site)` or `app/(api)`, and every public route is
 * absent from it. The two files are meant to be read together: anything this
 * app serves is either in the sitemap or in this list.
 *
 * `Disallow` is a crawl instruction, not an access control and not a promise of
 * privacy. Everything here is already refused server-side — `expectSession()`,
 * a permission check, or a `CRON_SECRET` bearer token — and this only stops a
 * crawler spending its budget on redirects to `/auth` and on 401s. The pages
 * that a signed-in member CAN reach also carry `robots: { index: false }` in
 * their own metadata, which is the half that keeps a URL out of the index if a
 * crawler reaches it by some other path; a line here cannot do that.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // (site) — signed-in or permission-gated pages.
        "/console", // officer tools; every page checks a permission flag
        "/account", // the viewer's own profile
        "/oauth", // /oauth/consent, mid-authorization-flow only
        "/tools", // /tools/oauth, a member's own test client
        "/vote", // ballots; expectSession() -> /auth
        "/teams", // /teams/requests; expectSession() -> /auth

        // (api) — route handlers. None of these render HTML, and several are
        // guarded by a shared secret rather than a session, so a crawler
        // reaching them gets a 401 or a 503 at best.
        "/cron", // CRON_SECRET-guarded jobs
        "/airtable", // the officers' sync trigger
        "/attendance", // check-in submissions (and public/attendance/*)
        "/auth", // sign-in entry point and OAuth callback
        "/discord", // Discord interaction webhook, signature-verified
        "/github", // GitHub App webhook, signature-verified
        "/supabase", // sandbox OAuth authorize/callback
        "/sandbox", // sandbox environment control
        "/export", // CSV exports, permission-gated
        "/search", // JSON search API; there is no results PAGE to index
        // Not private — it 307s to the UGA Involvement Network listing. It is
        // here because a crawler following it leaves the site entirely, and
        // the destination is already in the Organization JSON-LD's `sameAs`.
        "/join",
      ],
    },
    /**
     * Absolute, and built from the same `BASE_URL` the sitemap's own `<loc>`
     * entries are: a `Sitemap:` line pointing at a different origin than the
     * URLs inside the file is ignored. `.replace` for the same reason as there
     * — the value carries no trailing slash today and this makes that not
     * matter.
     */
    sitemap: `${env.BASE_URL.replace(/\/$/, "")}/sitemap.xml`,
  };
}
