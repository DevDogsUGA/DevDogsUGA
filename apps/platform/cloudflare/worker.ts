/**
 * Custom Cloudflare Worker entry; wrangler `main` points here. It composes
 * vinext's own App Router request handler with the cron `scheduled` handler
 * from ./scheduled.
 *
 * vinext's Cloudflare integration normally deploys straight from
 * `vinext/server/app-router-entry` as `main` with no custom entry at all --
 * see the migrate-to-vinext skill's config-examples.md. This app keeps a
 * custom entry anyway, for the one thing that integration doesn't cover:
 * composing Sentry's `withSentry` around `fetch`/`scheduled` (see below).
 * Unlike apps/schedule-builder/cloudflare/worker.ts there is no Workflow
 * class to re-export here.
 *
 * Server-side Sentry capture is wired HERE, via `@sentry/cloudflare`'s
 * `withSentry`, and deliberately NOT via `@sentry/nextjs`'s usual
 * `sentry.server.config.ts` / `instrumentation.ts` pattern. That pattern
 * assumes a Vercel/Node/Edge runtime; on OpenNext-on-Workers it threw
 * "Cannot call this AsyncLocalStorage bound function outside of the request
 * in which it was created" (getsentry/sentry-javascript#18842), because
 * `Sentry.captureRequestError` collided with OpenNext's own
 * AsyncLocalStorage-based request context, and the same constraint applies
 * to vinext's own request-scoped `AsyncLocalStorage`. `withSentry`
 * instruments the `fetch` (and here, `scheduled`) handler from OUTSIDE that
 * request context instead, which sidesteps the crash and still captures
 * every unhandled error thrown inside a route, a Server Component render, a
 * Server Action, or the cron dispatcher below -- they all run inside this
 * `fetch`/`scheduled` call. `SENTRY_DSN` reaches this Worker like every
 * other secret/env var (Bitwarden -> `env push` -> deploy); wrangler.jsonc
 * itself carries none.
 */
import * as Sentry from "@sentry/cloudflare";
import { buildSentryOptions } from "@devdogsuga/telemetry";
import handler from "vinext/server/app-router-entry";
import { scheduled, type CronEnv } from "./scheduled";
import type { env as platformEnv } from "~/env";

/**
 * The bindings this entry reads, borrowed by type from `~/env`. `SENTRY_DSN`
 * is a Worker secret; `DEPLOY_ENV` is set by wrangler.jsonc's per-env `vars`
 * block and the cf:build:* scripts.
 *
 * `SENTRY_RELEASE` is NOT part of `~/env`'s schema -- it is the deploy's git
 * SHA, minted fresh by CI every run rather than a value Bitwarden holds, so
 * it does not fit `EnvScope`'s "environment"/"default"/"developer" options.
 * `deploy.yaml`'s `Deploy` step passes it to `wrangler deploy` as a `--var`
 * (see `devtools`' `ci.ts`), the same mechanism the sandbox app uses for
 * `PLATFORM_REST_URL`, so it lands here as an ordinary (optional -- absent
 * outside CI) binding rather than a secret.
 *
 * `@sentry/cloudflare`'s `withSentry` infers ONE `Env` type parameter shared
 * by both the options callback below and the `fetch`/`scheduled` handler
 * object, so this type also has to satisfy whatever those two need: `./
 * scheduled`'s own `CronEnv` (`CRON_SECRET`/`BASE_URL`), and vinext's
 * `app-router-entry` handler's `env` parameter (pulled in structurally via
 * `Parameters<...>` rather than duplicated, so it can't drift). Without the
 * latter, TypeScript's "weak type" check rejects passing this `env` through
 * to `handler.fetch` -- `WorkerAssetEnv` is all-optional (just `ASSETS?`)
 * and shares no property names with the rest of this type otherwise. See
 * apps/schedule-builder/cloudflare/worker.ts for the identical shape.
 */
type WorkerEnv = Pick<typeof platformEnv, "SENTRY_DSN" | "DEPLOY_ENV"> &
  CronEnv &
  NonNullable<Parameters<typeof handler.fetch>[1]> & {
    readonly SENTRY_RELEASE?: string;
  };

export default Sentry.withSentry(
  (env: WorkerEnv) =>
    buildSentryOptions({
      service: "platform",
      environment: env.DEPLOY_ENV,
      dsn: env.SENTRY_DSN,
      release: env.SENTRY_RELEASE,
    }),
  {
    fetch: (request, env, ctx) => handler.fetch(request, env, ctx),
    scheduled: (event, env) => scheduled(event, env),
  },
);
