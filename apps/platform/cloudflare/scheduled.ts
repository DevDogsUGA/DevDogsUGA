/**
 * Cloudflare cron dispatcher (replaces vercel.json crons). Intended to be
 * composed with the OpenNext-generated worker: a thin custom entry re-exports
 * the OpenNext `fetch` handler and adds this `scheduled` handler, with wrangler
 * `main` pointing at that entry. Kept standalone until the Cloudflare deploy is
 * validated end-to-end.
 *
 * Each cron hits the existing CRON_SECRET-guarded route, so no route logic
 * changes — the schedules mirror the former vercel.json entries.
 */
interface Env {
  CRON_SECRET: string;
}

const CRON_ROUTES: Record<string, string> = {
  "0 0 * * *": "/api/github/sync-leaderboard",
  "* * * * *": "/api/cron/deliver-webhooks",
  "*/10 * * * *": "/api/cron/sync-discord-roles",
};

export async function scheduled(
  event: { cron: string },
  env: Env,
  baseUrl: string,
): Promise<void> {
  const path = CRON_ROUTES[event.cron];
  if (!path) return;
  await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
}
