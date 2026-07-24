/**
 * Cloudflare cron dispatcher (replaces vercel.json crons). Composed with the
 * OpenNext-generated worker (see the platform app's cloudflare/scheduled.ts for
 * the pattern). One daily trigger fans out to both scraper routes, which are
 * CRON_SECRET-guarded and unchanged.
 *
 * WARNING: the registrar/RMP scrapers are long-running — a single Workers
 * scheduled invocation may exceed CPU/wall-time limits. Consider splitting into
 * Queues/Workflows or chunked runs before production.
 */
interface Env {
  CRON_SECRET: string;
}

const SCRAPE_ROUTES = ["/api/cron/scrape-registrar", "/api/cron/scrape-rmp"];

export async function scheduled(
  _event: { cron: string },
  env: Env,
  baseUrl: string,
): Promise<void> {
  for (const path of SCRAPE_ROUTES) {
    await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
  }
}
