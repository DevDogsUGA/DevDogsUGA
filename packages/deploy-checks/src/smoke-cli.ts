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
 *   - config-reconcile succeeded (platform only; already gated earlier in
 *     the pipeline by reconcile-cli.ts in deploy.yaml's migrate jobs -- this
 *     re-checks the LIVE route after the new code is deployed, which is a
 *     different moment than the post-migrate check)
 *   - Sentry's release for this deploy is visible, and each app's Crons
 *     monitors have a check-in on record -- both skipped with a notice, not
 *     failed, when SENTRY_AUTH_TOKEN is absent (Sentry not onboarded yet)
 */
import {
  allPassed,
  checkProtectedRedirect,
  checkPublicRoute,
  checkReconcile,
  formatResults,
  type CheckResult,
} from "./checks.js";
import { configFor, hostFor, type App } from "./config.js";
import { requireArg, requireTier } from "./args.js";
import {
  checkCronMonitorCheckins,
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

  for (const path of config.publicPaths) {
    results.push(await checkPublicRoute(`${origin}${path}`));
  }

  results.push(
    await checkProtectedRedirect(
      `${origin}${config.protectedPath}`,
      config.protectedRedirectPrefix,
    ),
  );

  if (app === "platform") {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      results.push({
        name: "config-reconcile",
        status: "fail",
        detail: "CRON_SECRET is not set.",
      });
    } else {
      results.push(
        await checkReconcile(`${origin}/cron/config-reconcile`, cronSecret),
      );
    }
  }

  const sentryConfig = resolveSentryConfig({
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  });
  if (!sentryConfig) {
    results.push(skippedSentryCheck("Sentry release"));
    if (config.cronMonitorSlugs.length > 0) {
      results.push(skippedSentryCheck("Sentry Crons check-ins"));
    }
  } else {
    const release = process.env.GITHUB_SHA;
    if (release) {
      results.push(await checkSentryRelease(sentryConfig, release));
    }
    for (const slug of config.cronMonitorSlugs) {
      results.push(await checkCronMonitorCheckins(sentryConfig, slug));
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
