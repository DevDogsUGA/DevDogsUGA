/**
 * Browser-side Sentry init. Next.js loads this automatically -- no explicit
 * import anywhere -- because of its name and location (same level as
 * `middleware.ts`); see
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client.
 *
 * Deliberately the ONLY client-side Sentry surface. There is no
 * `sentry.client.config.ts` (the older convention this file replaces) and,
 * just as deliberately, no `sentry.server.config.ts` / `instrumentation.ts`
 * server-side `Sentry.init()` call anywhere in this app: server capture is
 * wired in `cloudflare/worker.ts` via `@sentry/cloudflare`'s `withSentry`
 * instead, because the `@sentry/nextjs` server pattern crashes under
 * OpenNext-on-Workers (see the comment in `cloudflare/worker.ts` for why).
 *
 * Minimal by design, per the workspace's settled Sentry scope: error capture
 * only. No browser tracing (`tracesSampleRate: 0` here, unconditionally --
 * NOT `tracesSampleRateFor(environment)`, which is a server-only knob) and no
 * Session Replay (no `replayIntegration()`, `integrations: []`, both replay
 * sample rates zeroed). `browserNoiseFilter` drops the known
 * extension/ad-blocker noise `@devdogsuga/telemetry` documents.
 */
import * as Sentry from "@sentry/nextjs";
import { browserNoiseFilter, buildSentryOptions } from "@devdogsuga/telemetry";
import { env } from "~/env";

const options = buildSentryOptions({
  service: "platform",
  environment: env.NEXT_PUBLIC_DEPLOY_ENV,
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  extraBeforeSend: [browserNoiseFilter],
});

// No DSN (the normal state before the org is onboarded, and every local dev
// run) means no `Sentry.init()` call at all -- no network, no console noise.
if (options) {
  Sentry.init({
    ...options,
    tracesSampleRate: 0,
    integrations: [],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
