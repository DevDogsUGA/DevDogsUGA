/**
 * Cloudflare cron dispatcher (replaces vercel.json crons). Composed into the
 * deployed worker by cloudflare/worker.ts, which re-exports the OpenNext
 * `fetch` handler and wires this `scheduled` handler; wrangler `main` points at
 * that entry and `triggers.crons` fires these schedules.
 *
 * Each cron hits the existing CRON_SECRET-guarded route on the worker's own
 * public origin (`env.BASE_URL`), so no route logic changes — the schedules
 * mirror the former vercel.json entries.
 */
export interface CronEnv {
  CRON_SECRET: string;
  BASE_URL: string;
}

const CRON_ROUTES: Record<string, string> = {
  "0 0 * * *": "/api/github/sync-leaderboard",
  "* * * * *": "/api/cron/deliver-webhooks",
  "*/10 * * * *": "/api/cron/sync-discord-roles",
};

export async function scheduled(
  event: { cron: string },
  env: CronEnv,
): Promise<void> {
  const path = CRON_ROUTES[event.cron];
  if (!path) return;
  await fetch(`${env.BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
}
