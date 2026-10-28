/**
 * Which host serves which app at which tier, and which routes are safe to
 * smoke-test unauthenticated: the per-app data `deploy smoke` and
 * `deploy reconcile` need.
 *
 * It stays in DevDogsUGA, as a `smoke` field on each app's entry in
 * `workers.json`, because it describes the apps (their routes, their auth
 * redirect) and changes with them:
 *
 *   { "path": "apps/platform", "smoke": {
 *       "hosts": { "staging": "staging.devdogsuga.org", "production": "devdogsuga.org" },
 *       "publicPaths": ["/", "/events"],
 *       "protectedPath": "/settings/profile",
 *       "protectedRedirectPrefix": "/auth" } }
 *
 * Until that field exists in a checkout, `FALLBACK_SMOKE` (the table
 * DevDogsUGA's `packages/deploy-checks` carried) answers for the two apps that
 * had one, so the commands work against a checkout from before the move. An
 * entry that has the field always wins. An app with neither has no smoke
 * test, which is said rather than treated as a pass.
 *
 * Meaning of the fields:
 *
 *   * `publicPaths`: root-relative paths expected to answer 200 with no
 *     session. A deliberately small, stable set of informational routes.
 *   * `protectedPath`: one route an anonymous visitor cannot reach directly.
 *     It can be a synthetic path when the app gates everything not on its
 *     public allowlist. It must redirect, not 404: the platform's `/console`
 *     answers a signed-out visitor with the 404 (F1), so the platform checks
 *     `/settings/profile`, which sends them to sign in.
 *   * `protectedRedirectPrefix`: what the `Location` of the anonymous request
 *     to `protectedPath` must start with.
 */
import { basename } from "node:path";
import { z } from "zod";
import { discoverRepoRoot } from "@devdogsuga/cli-core/repo/root";
import { workerEntries } from "@devdogsuga/cli-core/workers";

export const TIERS = ["staging", "production"] as const;
export type Tier = (typeof TIERS)[number];

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

export const smokeSchema = z.object({
  hosts: z.object({
    staging: z.string().min(1),
    production: z.string().min(1),
  }),
  publicPaths: z.array(z.string().startsWith("/")),
  protectedPath: z.string().startsWith("/"),
  protectedRedirectPrefix: z.string().min(1),
});

export type AppSmokeConfig = z.infer<typeof smokeSchema>;

/** What DevDogsUGA's `deploy-checks` carried before the field existed. */
export const FALLBACK_SMOKE: Readonly<Record<string, AppSmokeConfig>> = {
  platform: {
    hosts: { staging: "staging.devdogsuga.org", production: "devdogsuga.org" },
    publicPaths: [
      "/",
      "/events",
      "/docs",
      "/partners",
      "/changelog",
      "/attendance",
      "/legal/privacy",
      "/legal/terms",
    ],
    protectedPath: "/console/permissions",
    protectedRedirectPrefix: "/auth",
  },
  "schedule-builder": {
    hosts: { staging: "staging.dogdays.dev", production: "dogdays.dev" },
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
    protectedPath: "/dashboard",
    protectedRedirectPrefix: "/",
  },
};

/** The checkout's `workers.json` entries; none when there is no checkout, so
 * `--no-env` smoke runs on a bare runner use the fallback table. */
function checkoutEntries(): readonly { path: string; smoke?: unknown }[] {
  return discoverRepoRoot() === null ? [] : workerEntries();
}

/**
 * The smoke data for `app`, or `undefined` when the app has none.
 *
 * `entries` is injectable for tests; it defaults to the checkout's
 * `workers.json`. A `smoke` field that does not match the schema is an error
 * naming the app, never a silent fallback: a typo there would otherwise smoke
 * the stale table and call it green.
 */
export function smokeConfigFor(
  app: string,
  entries: readonly { path: string; smoke?: unknown }[] = checkoutEntries(),
): AppSmokeConfig | undefined {
  const entry = entries.find((candidate) => basename(candidate.path) === app);
  if (entry?.smoke !== undefined) {
    const parsed = smokeSchema.safeParse(entry.smoke);
    if (!parsed.success) {
      throw new Error(
        `workers.json: the "smoke" field of ${entry.path} is invalid: ` +
          parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
      );
    }
    return parsed.data;
  }
  return FALLBACK_SMOKE[app];
}
