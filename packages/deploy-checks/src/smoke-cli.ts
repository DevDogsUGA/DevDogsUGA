#!/usr/bin/env node
/**
 * `pnpm --filter @devdogsuga/deploy-checks run smoke-test -- --tier <staging|production> --app <platform|schedule-builder>`
 *
 * Called from `.github/workflows/deploy-app.yaml`'s per-app deploy step,
 * once per matrix entry, after that app's Worker deploy. Read-only: every
 * request is a GET against the app's own public origin, plus authenticated
 * GETs against Sentry's API when configured. Exits non-zero -- and so fails
 * that tier's deploy job -- if any non-skipped check fails.
 *
 * Covers, per TASK-300:
 *   - every listed public route answers 200
 *   - the one known protected route redirects an anonymous request
 *   - Sentry's release for this deploy is visible -- skipped with a notice,
 *     not failed, when SENTRY_AUTH_TOKEN is absent (Sentry not onboarded yet)
 *
 * Crons monitors aren't checked; see `sentry.ts` for why.
 *
 * Deliberately does NOT re-check config-reconcile: deploy-app.yaml runs a
 * dedicated "Reconcile meetings/workshops from @devdogsuga/events" step
 * (platform matrix entry only) right before this one, and that step is the
 * sole authoritative reconcile trigger for a deploy -- see its own comment
 * for why calling the route a second time from here (or from deploy.yaml's
 * migrate jobs, where an earlier revision of this step lived) is wrong, not
 * merely redundant.
 */
import {
  allPassed,
  checkProtectedRedirect,
  checkPublicRoute,
  retryWhilePropagating,
  formatResults,
  type CheckResult,
} from "./checks.js";
import { configFor, hostFor, type App } from "./config.js";
import { requireArg, requireTier } from "./args.js";
import {
  checkSentryRelease,
  resolveSentryConfig,
  skippedSentryCheck,
} from "./sentry.js";

function requireApp(argv: readonly string[]): App {
  const app = requireArg(argv, "--app");
  if (app !== "platform" && app !== "schedule-builder") {
    throw new Error(
      `--app must be "platform" or "schedule-builder", got "${app}".`,
    );
  }
  return app;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const tier = requireTier(argv);
  const app = requireApp(argv);
  const config = configFor(app);
  const origin = `https://${hostFor(app, tier)}`;

  const results: CheckResult[] = [];
  // A 503 while the new version propagates isn't a broken route; see
  // `retryWhilePropagating`.
  const fetchApp = retryWhilePropagating();

  for (const path of config.publicPaths) {
    results.push(await checkPublicRoute(`${origin}${path}`, fetchApp));
  }

  results.push(
    await checkProtectedRedirect(
      `${origin}${config.protectedPath}`,
      config.protectedRedirectPrefix,
      fetchApp,
    ),
  );

  const sentryConfig = resolveSentryConfig({
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  });
  if (!sentryConfig) {
    results.push(skippedSentryCheck("Sentry release"));
  } else {
    const release = process.env.GITHUB_SHA;
    if (release) {
      results.push(await checkSentryRelease(sentryConfig, release));
    }
  }

  process.stdout.write(`${formatResults(results)}\n`);
  for (const result of results) {
    if (result.status === "skip") {
      process.stdout.write(
        `::notice::${result.name} skipped -- ${result.detail}\n`,
      );
    }
  }
  return allPassed(results) ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(
      `smoke-cli: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
