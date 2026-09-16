/// <reference path="../cloudflare-env.d.ts" />
/**
 * Cloudflare cron dispatcher, replacing the vercel.json crons.
 * cloudflare/worker.ts composes it into the deployed worker, the same pattern
 * the platform app uses.
 *
 * The daily registrar scrape used to fan out to a route on the worker's own
 * public origin (`env.BASE_URL`), running entirely inside one Workers
 * scheduled invocation -- risking that invocation's CPU/wall-time limits.
 * It now triggers `ScrapeWorkflow` (see ./ScrapeWorkflow.ts) directly through
 * its binding instead: the Workflow splits the same work into one retried,
 * checkpointed step per term, run outside the scheduled handler's own
 * lifetime.
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
 * throw `Invalid URL`. `SCRAPE_WORKFLOW` is picked off the generated,
 * wrangler.jsonc-derived `CloudflareEnv` for the same reason: its shape (and
 * whether it exists at all) tracks the real `workflows` binding instead of a
 * hand-rolled guess. Both imports are type-only, so nothing lands in the
 * Worker bundle.
 */
export type CronEnv = Pick<typeof env, "CRON_SECRET" | "BASE_URL"> &
  Pick<CloudflareEnv, "SCRAPE_WORKFLOW">;

/** Cron expression that triggers the daily registrar `ScrapeWorkflow`. */
const REGISTRAR_SCRAPE_CRON = "5 14 * * *";

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
 * KNOWN GAP: empty now that the registrar cron (`REGISTRAR_SCRAPE_CRON`)
 * triggers a Workflow instead of a route. `devtools cron list` doesn't know
 * about Workflow triggers yet, so it will report that real, firing trigger as
 * firing nothing. Accepted; tracked separately.
 */
export const CRON_ROUTES: Record<string, { routes: string[]; label: string }> =
  {};

export async function scheduled(
  event: { cron: string },
  env: CronEnv,
): Promise<void> {
  if (event.cron === REGISTRAR_SCRAPE_CRON) {
    await env.SCRAPE_WORKFLOW.create();
  }

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
