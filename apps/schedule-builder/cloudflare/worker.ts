/**
 * Custom Cloudflare Worker entry; wrangler `main` points here. It composes
 * vinext's own App Router request handler with the cron `scheduled` handler
 * from ./scheduled, and re-exports the Workflow class below.
 *
 * vinext's Cloudflare integration normally deploys straight from
 * `vinext/server/app-router-entry` as `main` with no custom entry at all --
 * see the migrate-to-vinext skill's config-examples.md. This app keeps a
 * custom entry anyway, for the two things that integration doesn't cover:
 * composing Sentry's `withSentry` around `fetch`/`scheduled` (see below), and
 * exporting `ScrapeWorkflow` so wrangler.jsonc's `workflows[].class_name` can
 * find it from `main`.
 *
 * Server-side Sentry capture is wired HERE, via `@sentry/cloudflare`'s
 * `withSentry`, and deliberately NOT via `@sentry/nextjs`'s usual
 * `sentry.server.config.ts` / `instrumentation.ts` pattern -- same reasoning
 * as `apps/platform/cloudflare/worker.ts`: that pattern assumes a
 * Vercel/Node/Edge runtime and throws "Cannot call this AsyncLocalStorage
 * bound function outside of the request in which it was created"
 * (getsentry/sentry-javascript#18842) under OpenNext-on-Workers, and the same
 * constraint applies to vinext's own request-scoped `AsyncLocalStorage`.
 * `withSentry` instruments the `fetch`/`scheduled` handler from OUTSIDE that
 * request context instead, capturing every unhandled error thrown inside a
 * route, a Server Component render, a Server Action, or the cron dispatcher
 * below. `SCHEDULE_BUILDER_SENTRY_DSN` reaches this Worker like every other secret/env var;
 * this file carries none.
 */
import * as Sentry from "@sentry/cloudflare";
import { buildSentryOptions } from "@devdogsuga/telemetry";
import handler from "vinext/server/app-router-entry";
import { scheduled, type CronEnv } from "./scheduled";
import type { env as scheduleBuilderEnv } from "~/env";

/**
 * The bindings this entry reads, borrowed by type from `~/env` -- same
 * pattern as the platform app's `WorkerEnv`. `SCHEDULE_BUILDER_SENTRY_DSN` is a Worker secret;
 * `DEPLOY_ENV` is set by wrangler.jsonc's per-env `vars` block and the
 * cf:build:* scripts.
 *
 * `SENTRY_RELEASE` is NOT part of `~/env`'s schema -- see `apps/platform/
 * cloudflare/worker.ts`'s `WorkerEnv` for why. It reaches this Worker as a
 * `--var` on `wrangler deploy` (see `devtools`' `ci.ts`), same as platform.
 *
 * `@sentry/cloudflare`'s `withSentry` infers ONE `Env` type parameter shared
 * by both the options callback below and the `fetch`/`scheduled` handler
 * object, so this type also has to satisfy whatever those two need: `./
 * scheduled`'s own `CronEnv` (`BASE_URL`/`CRON_SECRET`), and vinext's
 * `app-router-entry` handler's `env` parameter (pulled in structurally via
 * `Parameters<...>` rather than duplicated, so it can't drift). Without the
 * latter, TypeScript's "weak type" check rejects passing this `env` through
 * to `handler.fetch` -- `WorkerAssetEnv` is all-optional (just `ASSETS?`)
 * and shares no property names with the rest of this type otherwise.
 */
type WorkerEnv = Pick<
  typeof scheduleBuilderEnv,
  "SCHEDULE_BUILDER_SENTRY_DSN" | "DEPLOY_ENV"
> &
  CronEnv &
  NonNullable<Parameters<typeof handler.fetch>[1]> & {
    readonly SENTRY_RELEASE?: string;
  };

// The Workflow class must be reachable from `main` (this file) for
// wrangler's `workflows[].class_name: "ScrapeWorkflow"` binding to find it.
// See wrangler.jsonc and ./ScrapeWorkflow.ts. It carries its own,
// independent Sentry instrumentation -- see that file -- because a Workflow
// does not run inside this `fetch`/`scheduled` handler's call, so wrapping
// them here would not cover it.
export { ScrapeWorkflow } from "./ScrapeWorkflow";

export default Sentry.withSentry(
  (env: WorkerEnv) =>
    buildSentryOptions({
      service: "schedule-builder",
      environment: env.DEPLOY_ENV,
      dsn: env.SCHEDULE_BUILDER_SENTRY_DSN,
      release: env.SENTRY_RELEASE,
    }),
  {
    fetch: (request, env, ctx) => handler.fetch(request, env, ctx),
    scheduled: (event, env) => scheduled(event, env),
  },
);
