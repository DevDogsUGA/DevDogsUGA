/**
 * Custom Cloudflare Worker entry; wrangler `main` points here. It re-exports the
 * OpenNext-generated `fetch` handler and any Durable Object classes the
 * generated worker exports, then adds the cron `scheduled` handler from
 * ./scheduled.
 *
 * `opennextjs-cloudflare build` produces `../.open-next/worker.js`, which is
 * gitignored and so does not exist at typecheck time. That is why tsconfig.json
 * "exclude" keeps this file out of `tsc`. wrangler/esbuild bundles it at build
 * time, where the generated import does resolve.
 *
 * Server-side Sentry capture is wired HERE, via `@sentry/cloudflare`'s
 * `withSentry`, and deliberately NOT via `@sentry/nextjs`'s usual
 * `sentry.server.config.ts` / `instrumentation.ts` pattern -- same reasoning
 * as `apps/platform/cloudflare/worker.ts`: that pattern assumes a
 * Vercel/Node/Edge runtime and throws "Cannot call this AsyncLocalStorage
 * bound function outside of the request in which it was created"
 * (getsentry/sentry-javascript#18842) under OpenNext-on-Workers. `withSentry`
 * instruments the `fetch`/`scheduled` handler from OUTSIDE that request
 * context instead, capturing every unhandled error thrown inside a route, a
 * Server Component render, a Server Action, or the cron dispatcher below.
 * `SENTRY_DSN` reaches this Worker like every other secret/env var; this file
 * carries none.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import * as Sentry from "@sentry/cloudflare";
import { buildSentryOptions } from "@devdogsuga/telemetry";
import openNextHandler from "../.open-next/worker.js";
import { scheduled } from "./scheduled";
import type { env as scheduleBuilderEnv } from "~/env";

/**
 * The bindings this entry reads, borrowed by type from `~/env` -- same
 * pattern as the platform app's `WorkerEnv`. `SENTRY_DSN` is a Worker secret;
 * `DEPLOY_ENV` is set by wrangler.jsonc's per-env `vars` block and the
 * cf:build:* scripts.
 *
 * `SENTRY_RELEASE` is NOT part of `~/env`'s schema -- see `apps/platform/
 * cloudflare/worker.ts`'s `WorkerEnv` for why. It reaches this Worker as a
 * `--var` on `wrangler deploy` (see `devtools`' `ci.ts`), same as platform.
 */
type WorkerEnv = Pick<
  typeof scheduleBuilderEnv,
  "SENTRY_DSN" | "DEPLOY_ENV"
> & {
  readonly SENTRY_RELEASE?: string;
};

export * from "../.open-next/worker.js";
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
      dsn: env.SENTRY_DSN,
      release: env.SENTRY_RELEASE,
    }),
  {
    ...openNextHandler,
    scheduled: (event, env) => scheduled(event, env),
  },
);
