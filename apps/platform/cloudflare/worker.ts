/**
 * Custom Cloudflare Worker entry (wrangler `main` points here). Re-exports the
 * OpenNext-generated `fetch` handler, plus any Durable Object classes the
 * generated worker exports, and adds the cron `scheduled` handler from
 * ./scheduled.
 *
 * `../.open-next/worker.js` is produced by `opennextjs-cloudflare build` and is
 * gitignored, so it does not exist at typecheck time. This file is therefore
 * excluded from `tsc` (see tsconfig.json "exclude") and bundled by
 * wrangler/esbuild at build time, which resolves the generated import.
 *
 * Server-side Sentry capture is wired HERE, via `@sentry/cloudflare`'s
 * `withSentry`, and deliberately NOT via `@sentry/nextjs`'s usual
 * `sentry.server.config.ts` / `instrumentation.ts` pattern. That pattern
 * assumes a Vercel/Node/Edge runtime; on OpenNext-on-Workers it throws
 * "Cannot call this AsyncLocalStorage bound function outside of the request
 * in which it was created" (getsentry/sentry-javascript#18842), because
 * `Sentry.captureRequestError` collides with OpenNext's own
 * AsyncLocalStorage-based request context. `withSentry` instruments the
 * `fetch` (and here, `scheduled`) handler from OUTSIDE that request context
 * instead, which sidesteps the crash and still captures every unhandled
 * error thrown inside a route, a Server Component render, a Server Action,
 * or the cron dispatcher below -- they all run inside this `fetch`/`scheduled`
 * call. `SENTRY_DSN` reaches this Worker like every other secret/env var
 * (Bitwarden -> `env push` -> deploy); wrangler.jsonc itself carries none.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import * as Sentry from "@sentry/cloudflare";
import { buildSentryOptions } from "@devdogsuga/telemetry";
import openNextHandler from "../.open-next/worker.js";
import { scheduled } from "./scheduled";
import type { env as platformEnv } from "~/env";

/**
 * The bindings this entry reads, borrowed by type from `~/env` (see
 * `CronEnv` in ./scheduled for why: a `Pick` off the schema, type-only, so a
 * variable can't drift between what this file expects and what the schema
 * declares). `SENTRY_DSN` is a Worker secret; `DEPLOY_ENV` is set by
 * wrangler.jsonc's per-env `vars` block and the cf:build:* scripts.
 */
type WorkerEnv = Pick<typeof platformEnv, "SENTRY_DSN" | "DEPLOY_ENV">;

export * from "../.open-next/worker.js";

export default Sentry.withSentry(
  (env: WorkerEnv) =>
    buildSentryOptions({
      service: "platform",
      environment: env.DEPLOY_ENV,
      dsn: env.SENTRY_DSN,
    }),
  {
    ...openNextHandler,
    scheduled: (event, env) => scheduled(event, env),
  },
);
