/**
 * Server-side capture for the errors vinext catches itself.
 *
 * `cloudflare/worker.ts`'s `withSentry` only sees an error that escapes
 * `fetch`. A throwing Server Component, route handler or Server Action never
 * does: vinext catches it, renders the error boundary or a 500, and hands it to
 * this hook instead. Without the hook, the browser's copy was all that reached
 * Sentry, stripped of its message and stack.
 *
 * This file uses `@sentry/cloudflare`'s `captureException` and not
 * `@sentry/nextjs`'s `captureRequestError`. The latter crashes on Workers (see
 * worker.ts). It reports to the client `withSentry` already initialized, and it
 * no-ops without a DSN.
 */
import * as Sentry from "@sentry/cloudflare";

export function onRequestError(
  error: unknown,
  request: Readonly<{ method: string }>,
  context: Readonly<{ routePath: string; routeType: string }>,
): void {
  Sentry.captureException(error, {
    tags: { "route.type": context.routeType },
    // The route pattern and not the request path, whose query string can
    // carry an OAuth code or an attendance token.
    extra: { method: request.method, routePath: context.routePath },
  });
}
