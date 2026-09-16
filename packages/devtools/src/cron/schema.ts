/**
 * Zod schema for the `CRON_ROUTES` export each app's `cloudflare/scheduled.ts`
 * must conform to.
 *
 * devtools enforces this at its import boundary (see `discovery.ts`): an app
 * that drifts from the shape fails the audit and a conformance test, rather
 * than reading as an empty (silently unaudited) map.
 *
 * Invariants, each a test rather than a hope:
 *   - Every route starts `/` and lives on the app's own origin.
 *   - `routes` is non-empty: a key that fires nothing is a config bug.
 *   - `label` is non-blank: the audit's English description; never empty.
 *   - Keyed by the cron expression exactly as wrangler carries it, so
 *     reconciliation is a set comparison, never a parse.
 */
import { z } from "zod";

const CronRoute = z.string().startsWith("/");

const CronEntry = z.object({
  routes: z.array(CronRoute).min(1),
  label: z.string().min(1),
});

export const CronRoutes = z.record(z.string(), CronEntry);
export type CronRoutes = z.infer<typeof CronRoutes>;
export type CronEntry = z.infer<typeof CronEntry>;
