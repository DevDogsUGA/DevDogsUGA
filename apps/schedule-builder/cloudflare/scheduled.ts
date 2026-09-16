/**
 * Cloudflare cron dispatcher, replacing the vercel.json crons.
 * cloudflare/worker.ts composes it into the deployed worker, the same pattern
 * the platform app uses. One daily trigger fans out to the scraper route on
 * the worker's own public origin (`env.BASE_URL`); the route stays
 * CRON_SECRET-guarded and unchanged.
 *
 * WARNING: the registrar scraper is long-running, and one Workers
 * scheduled invocation may exceed CPU/wall-time limits. Split into
 * Queues/Workflows or chunked runs before production.
 */
import type { env } from "~/env";

/**
 * The bindings this handler reads, derived from the env schema rather than
 * restated. A hand-written interface cannot fail the build when the schema
 * never declared the key. That is how `BASE_URL` was read here for a while with
 * no manifest supplying it, making every run throw `Invalid URL`. The import is
 * type-only, so nothing lands in the Worker bundle.
 */
export type CronEnv = Pick<typeof env, "CRON_SECRET" | "BASE_URL">;

/**
 * Cron expression to the routes it fires and a one-line description.
 *
 * Route-group segments in parentheses contribute no URL segment, so the
 * handlers under `src/app/(api)/cron/...` are served at `/cron/...`.
 *
 * Keyed by expression so `devtools cron list` can reconcile this map against
 * `wrangler.jsonc triggers.crons` and fire each key's routes as a faithful
 * tick. A flat array and a wildcard `event.cron` match would double-fire every
 * route if a second schedule were ever added — the keyed shape closes that bug.
 */
export const CRON_ROUTES: Record<string, { routes: string[]; label: string }> =
  {
    "5 14 * * *": {
      label: "Daily registrar scrape",
      routes: ["/cron/scrape-registrar"],
    },
  };

export async function scheduled(
  event: { cron: string },
  env: CronEnv,
): Promise<void> {
  const entry = CRON_ROUTES[event.cron];
  if (!entry) return;

  for (const path of entry.routes) {
    const url = `${env.BASE_URL}${path}`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      // Without this the course data can silently stop refreshing:
      // a 404 or a 500 is as quiet as a success to a bare `await fetch`.
      if (!response.ok) {
        console.error(
          `[cron] ${path} responded ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error(`[cron] ${path} failed:`, error);
    }
  }
}
