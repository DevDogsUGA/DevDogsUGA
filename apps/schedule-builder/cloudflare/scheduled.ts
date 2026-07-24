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
export interface CronEnv {
  CRON_SECRET: string;
  BASE_URL: string;
}

const SCRAPE_ROUTES = ["/api/cron/scrape-registrar", "/api/cron/scrape-rmp"];

export async function scheduled(
  _event: { cron: string },
  env: CronEnv,
): Promise<void> {
  for (const path of SCRAPE_ROUTES) {
    await fetch(`${env.BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
  }
}
