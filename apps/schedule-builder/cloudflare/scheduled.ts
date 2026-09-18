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
 * scrape, which now starts a Workflow rather than fetching a route (see
 * `WORKFLOW_CRONS` below). Kept as an exported empty map so the route-dispatch
 * mechanism — and its `devtools cron` audit — stays wired for whenever a
 * route-based cron exists again.
 */
export const CRON_ROUTES: Record<string, { routes: string[]; label: string }> =
  {};

/**
 * Cron expression to the Workflow binding it starts and a one-line description.
 * The daily registrar scrape lives here, not in `CRON_ROUTES`: it calls
 * `SCRAPE_WORKFLOW.create()` (see ScrapeWorkflow.ts) instead of fetching a
 * route on this worker's own origin.
 *
 * This is the single source of truth for the workflow schedule — `scheduled()`
 * below loops over it, and `devtools cron list` reconciles it against
 * `wrangler.jsonc triggers.crons` + `workflows[]`, so the trigger that used to
 * be invisible to the audit (it fired a Workflow, which `cron list` didn't
 * understand) now reads as a real, reconciled trigger. `devtools cron run`
 * fires it against a local `wrangler dev`/preview to smoke-test the scrape
 * before any deploy.
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

/**
 * Resolves a `WORKFLOW_CRONS` binding name to the concrete binding on `env`.
 * Kept beside the data map so `scheduled()` can fire by binding name without
 * losing the generated type of `env.SCRAPE_WORKFLOW` — a bare `env[binding]`
 * index would erase it. A binding named in `WORKFLOW_CRONS` but missing here is
 * a no-op, the same fail-safe direction as an unmatched cron expression.
 */
const WORKFLOW_BINDINGS: Record<
  string,
  (env: CronEnv) => CronEnv["SCRAPE_WORKFLOW"]
> = {
  SCRAPE_WORKFLOW: (env) => env.SCRAPE_WORKFLOW,
};

export async function scheduled(
  event: { cron: string },
  env: CronEnv,
): Promise<void> {
  const workflow = WORKFLOW_CRONS[event.cron];
  if (workflow) {
    const resolve = WORKFLOW_BINDINGS[workflow.binding];
    if (resolve) await resolve(env).create();
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
