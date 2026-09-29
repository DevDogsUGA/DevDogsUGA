/**
 * The one place that names which host serves which app at which tier, and
 * which routes are safe to smoke-test unauthenticated.
 *
 * Hosts mirror each app's `wrangler.jsonc` `env.<tier>.routes[0].pattern` --
 * see `config.test.ts`, which parses both `wrangler.jsonc` files and asserts
 * this table agrees with them, so a hostname change there cannot silently
 * leave this table stale.
 *
 * `publicPaths` mirrors each app's own notion of "public": for
 * schedule-builder that is `src/middleware.ts`'s `PUBLIC_PATHS` (this file's
 * test scrapes it and asserts the same set, filtered to entries with a real
 * page); platform has no single allowlist to scrape (routes are public
 * unless a page/layout gates itself), so this file's test instead asserts
 * every path here resolves to a real `page.tsx` under `src/app/(site)`,
 * which is the failure mode that actually rots silently -- a renamed or
 * deleted page, not a page whose gating changed. `protectedPath` is one
 * route each app is known to gate: platform's `/console/*` layout calls
 * `requireSession()`, and schedule-builder's middleware sends anything NOT
 * in `PUBLIC_PATHS` through the same gate, so a synthetic path exercises it
 * without depending on a real gated page existing yet.
 */

export type Tier = "staging" | "production";
export type App = "platform" | "schedule-builder";

export interface AppSmokeConfig {
  readonly app: App;
  readonly hosts: Readonly<Record<Tier, string>>;
  /** Root-relative paths expected to answer 200 with no session. */
  readonly publicPaths: readonly string[];
  /** A root-relative path an anonymous visitor cannot reach directly. */
  readonly protectedPath: string;
  /** The redirect Location an anonymous request to `protectedPath` must start with. */
  readonly protectedRedirectPrefix: string;
}

export const SMOKE_APPS: readonly AppSmokeConfig[] = [
  {
    app: "platform",
    hosts: {
      staging: "staging.devdogsuga.org",
      production: "devdogsuga.org",
    },
    // A deliberately small, stable subset of `(site)`'s pages: informational
    // routes that render for an anonymous visitor with no dynamic segment
    // and no `requireSession()`/`expectSession()` gate (verified by reading
    // each page; `/attendance` catches its own session lookup to `null`
    // rather than gating). `/account`, `/teams` and `/community` are
    // deliberately excluded -- the first two gate on a session, the third is
    // itself a redirect to an external roster, not a 200.
    publicPaths: [
      "/",
      "/events",
      "/docs",
      "/partners",
      "/changelog",
      "/attendance",
      "/legal/privacy",
    ],
    protectedPath: "/console/permissions",
    protectedRedirectPrefix: "/auth",
  },
  {
    app: "schedule-builder",
    hosts: {
      staging: "staging.dogdays.dev",
      production: "dogdays.dev",
    },
    // Every entry in src/middleware.ts's PUBLIC_PATHS that has a real page
    // (excludes "/auth/callback", which is a route handler, not a page).
    // config.test.ts scrapes that array and asserts equality.
    publicPaths: [
      "/",
      "/courses",
      "/plans",
      "/generate-schedule",
      "/manual-entry",
      "/questionnaire",
      "/past-credits",
      "/credit-data",
      "/settings",
      "/survey",
      "/route-map",
      "/distance-page",
    ],
    // Not a real page today -- every existing route is in PUBLIC_PATHS (see
    // config.test.ts's own note on this). The middleware still gates
    // anything ELSE, so a synthetic path exercises that branch; if a real
    // gated page is added later this can move to it, and the redirect
    // contract (Location starts with "/", carrying `?next=`) stays the same
    // either way.
    protectedPath: "/dashboard",
    protectedRedirectPrefix: "/",
  },
];

export function hostFor(app: App, tier: Tier): string {
  const config = SMOKE_APPS.find((entry) => entry.app === app);
  if (!config)
    throw new Error(`deploy-checks: no smoke config for app "${app}".`);
  return config.hosts[tier];
}

export function configFor(app: App): AppSmokeConfig {
  const config = SMOKE_APPS.find((entry) => entry.app === app);
  if (!config)
    throw new Error(`deploy-checks: no smoke config for app "${app}".`);
  return config;
}
