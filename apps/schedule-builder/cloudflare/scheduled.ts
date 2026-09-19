/// <reference path="../cloudflare-env.d.ts" />
/**
 * Cloudflare cron dispatcher, replacing the vercel.json crons.
 * cloudflare/worker.ts composes it into the deployed worker, the same pattern
 * the platform app uses.
 *
 * The daily registrar scrape is a native Workflow schedule configured on the
 * `workflows[]` binding in wrangler.jsonc. It does not pass through this Worker
 * scheduled handler.
 *
 * Any other cron still dispatches by fetching a route out of `CRON_ROUTES`,
 * the original mechanism -- there happen to be none right now, since the
 * registrar scrape was the only entry.
 */
import type { env } from "~/env";

/**
 * The bindings this handler reads. `CRON_SECRET`/`BASE_URL` are derived from
 * the env schema rather than restated -- a hand-written interface cannot fail
 * the build when the schema never declared the key. That is how `BASE_URL`
 * was read here for a while with no manifest supplying it, making every run
 * throw `Invalid URL`. The import is type-only, so nothing lands in the Worker
 * bundle.
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
 *
 * Empty on purpose: the only schedule this app has is the daily registrar
 * scrape, which has a native Workflow schedule (see `WORKFLOW_CRONS` below).
 * Kept as an exported empty map so the route-dispatch
 * mechanism — and its `devtools cron` audit — stays wired for whenever a
 * route-based cron exists again.
 */
export const CRON_ROUTES: Record<string, { routes: string[]; label: string }> =
  {};

/**
 * Cron expression to the natively scheduled Workflow binding and a one-line
 * description. This metadata lets `devtools cron list` give the trigger a
 * useful label and reconcile it against the binding's `schedules` field.
 *
 * Wrangler is the source of truth for whether it fires; this map is audit
 * metadata only. `devtools cron run` directs operators to `devtools workflows`
 * for manual smoke tests.
 */
export const WORKFLOW_CRONS: Record<
  string,
  { binding: string; label: string }
> = {
  "5 14 * * *": {
    binding: "SCRAPE_WORKFLOW",
    label:
      "Daily registrar scrape (one retried, checkpointed ScrapeWorkflow step per term)",
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
