#!/usr/bin/env node
/**
 * `pnpm --filter @devdogsuga/deploy-checks run reconcile -- --tier <staging|production>`
 *
 * Called from `.github/workflows/deploy.yaml`'s `staging-migrate` and
 * `production-migrate` jobs, immediately after `deploy migrate` applies that
 * tier's migrations -- the "deploy pipeline's post-migrate step" the
 * `config-reconcile` route's own doc comment already anticipated (see
 * apps/platform/src/app/(api)/cron/config-reconcile/route.ts). Exits
 * non-zero on a failed reconcile, which fails the job and so blocks that
 * tier's deploy -- `staging-deploy`/`production-deploy` both `needs:` the
 * migrate job that runs this.
 *
 * Only platform serves this route; the config being reconciled (meetings,
 * workshops) is platform's alone.
 */
import { checkReconcile, formatResults } from "./checks.js";
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
  const result = await checkReconcile(url, cronSecret);
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
