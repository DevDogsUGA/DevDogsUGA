/**
 * Cloudflare cron dispatcher (replaces vercel.json crons). Composed into the
 * deployed worker by cloudflare/worker.ts (see the platform app for the same
 * pattern). One daily trigger fans out to both scraper routes on the worker's
 * own public origin (`env.BASE_URL`); the routes are CRON_SECRET-guarded and
 * unchanged.
 *
 * WARNING: the registrar/RMP scrapers are long-running — a single Workers
 * scheduled invocation may exceed CPU/wall-time limits. Consider splitting into
 * Queues/Workflows or chunked runs before production.
 */
import type { env } from "~/env";

/**
 * The bindings this handler reads, derived from the env schema rather than
 * restated. A hand-written interface cannot fail the build when the schema
 * never declared the key — which is how `BASE_URL` was read here for a while
 * without any manifest supplying it, making every run throw `Invalid URL`.
 *
 * Type-only import, so nothing is pulled into the Worker bundle.
 */
export type CronEnv = Pick<typeof env, "CRON_SECRET" | "BASE_URL">;

/**
 * Route-group segments in parentheses contribute no URL segment, so the
 * handlers under `src/app/(api)/cron/...` are served at `/cron/...`.
 */
const SCRAPE_ROUTES = ["/cron/scrape-registrar", "/cron/scrape-rmp"];

export async function scheduled(
  _event: { cron: string },
  env: CronEnv,
): Promise<void> {
  for (const path of SCRAPE_ROUTES) {
    const url = `${env.BASE_URL}${path}`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      // Without this the course and RMP data can silently stop refreshing:
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
