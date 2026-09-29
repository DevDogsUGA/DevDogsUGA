#!/usr/bin/env node
/**
 * `pnpm --filter @devdogsuga/deploy-checks run reconcile -- --tier <staging|production>`
 *
 * Called from `.github/workflows/deploy-app.yaml`'s per-app deploy job, on
 * the `platform` matrix entry only, right after `Deploy platform` and
 * before the smoke test -- the "deploy pipeline" call the `config-reconcile`
 * route's own doc comment anticipated (see
 * apps/platform/src/app/(api)/cron/config-reconcile/route.ts), but placed
 * after THIS deploy rather than at migrate time. `@devdogsuga/events`'
 * config is bundled into the Worker at build time, so a migrate-time call
 * would reconcile against the PREVIOUS release's config, not this deploy's;
 * on production specifically, the currently-deployed Worker predates this
 * route entirely, so a migrate-time call there would 404 and block the
 * first promote of this pipeline forever. Exits non-zero on a failed
 * reconcile, which fails the deploy step running it.
 *
 * Only platform serves this route; the config being reconciled (meetings,
 * workshops) is platform's alone.
 */
import {
  checkReconcile,
  formatResults,
  retryWhilePropagating,
} from "./checks.js";
import { hostFor } from "./config.js";
import { requireTier } from "./args.js";

async function main(): Promise<number> {
  const tier = requireTier(process.argv.slice(2));
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    process.stderr.write("reconcile-cli: CRON_SECRET is not set.\n");
    return 1;
  }
  const url = `https://${hostFor("platform", tier)}/cron/config-reconcile`;
  // A 503 right after the deploy is the new version still propagating, not a
  // failed reconcile; see `retryWhilePropagating`.
  const result = await checkReconcile(url, cronSecret, retryWhilePropagating());
  process.stdout.write(`${formatResults([result])}\n`);
  return result.status === "fail" ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(
      `reconcile-cli: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
