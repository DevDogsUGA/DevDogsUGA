# @devdogsuga/telemetry

Shared Sentry constants, options builder, scrubbers, and `alert()` — the one
place that knows what "the workspace's Sentry setup" means, so
`apps/platform`, `apps/schedule-builder`, `apps/sandbox`, and
`packages/devtools` each call `Sentry.init()` the same way instead of
re-deriving sample rates and a `beforeSend` chain four times.

This package ships no `Sentry.init()` call of its own — each consumer still
picks its own `@sentry/nextjs` / `@sentry/cloudflare` / `@sentry/node`
package and calls `init()` itself, because that choice is per-runtime. What
this package owns is everything that should be identical across those four
calls.

## The no-op-without-DSN contract

Every function here is safe to call with telemetry unconfigured — which is
the normal state of local dev, where no service has a Sentry DSN:

- `buildSentryOptions({ dsn: undefined, ... })` returns `undefined`. The
  intended call site is:

  ```ts
  const opts = buildSentryOptions({ service: "platform", environment, dsn: env.SENTRY_DSN });
  if (opts) Sentry.init(opts);
  ```

  No DSN means no `Sentry.init()` call at all — no network, no console
  noise, nothing running.

- `alert()` checks `@sentry/core`'s `getClient()` before doing anything, so
  if the caller's service never initialized Sentry (no DSN), `alert()` sends
  nothing and returns.

- `alert()` additionally **never throws**, DSN or no DSN. It is called from
  inside passes whose actual job is something else — a failed alert must not
  turn a handled refusal into an unhandled exception.

## Transition-only alerting

`alert(title, lines, opts)` is the successor to platform's `postAlert`
(formerly `apps/platform/src/server/discord/alerts.ts`, which posted to
Discord and has been deleted). It is a thin wrapper over
`Sentry.captureMessage` at `warning` level, with a fingerprint derived from
`title` so repeated calls with the same title land in one Sentry issue
instead of a new issue per call.

**`alert()` sends unconditionally, every time it is called** — same as the
Discord version it replaces. It has no memory of previous calls, so it
cannot itself decide whether this is a new failure or the fortieth
repetition of an old one. That decision belongs to callers: alert on **state
transitions** (a check going from passing to failing, a new *kind* of
failure appearing) — never once per failed run of a background pass. The
transition-tracking logic that already existed at each `postAlert` call site
is preserved as-is; only the sink changed.

Sentry's own issue grouping (by fingerprint) then does the rest: even if a
caller's transition tracking has a bug and fires twice for the same
condition, both calls group into one issue rather than paging twice.

## Why `@sentry/core`, not `@sentry/node`/`@sentry/cloudflare`/`@sentry/nextjs`

`alert()` needs to call `captureMessage`, and this package is imported by
Node code (`devtools`), Cloudflare Workers code (`schedule-builder`'s
Workflows), and two Next.js apps. `@sentry/core` is the one package all
three platform SDKs are built on — `@sentry/node`, `@sentry/cloudflare`, and
`@sentry/nextjs` each call `@sentry/core`'s `initAndBind`/`setCurrentClient`
under the hood and write into the same global carrier. Calling
`@sentry/core`'s `captureMessage`/`getClient` from here therefore reaches
whichever SDK a given surface actually initialized, without this package
depending on a specific runtime SDK or every call site having to thread a
`Client` through as a parameter.

The same reasoning is why `buildSentryOptions` returns `@sentry/core`'s
`Options` (`CoreOptions`) type: it is the options shape `@sentry/node`,
`@sentry/cloudflare`, and `@sentry/nextjs`'s `init()` all accept, so the same
returned object is valid input to whichever one a consumer calls.

## Contents

- **Constants** (`SERVICES`, `Environment`, `tracesSampleRateFor`,
  `ERROR_SAMPLE_RATE`, `TAG_KEYS`) — the sample-rate table and tag-key
  spelling every consumer shares. `tracesSampleRate`: production `0.2`,
  staging `0.05`, everything else (`development`, `ci`, `local`) `0`. Errors
  are always sampled at `1` (`ERROR_SAMPLE_RATE`).
- **`buildSentryOptions`** — the common `Sentry.init()` options: DSN,
  environment, release passthrough, `tracesSampleRate` from the table,
  `enableLogs: true`, `sendDefaultPii: false`, and the scrubbing
  `beforeSend`.
- **Scrubbers** (`scrubPaths`, `scrubEmails`, `scrubSecrets`, `scrubText`,
  `scrubEvent`) — pure functions. `scrubEvent` is what `buildSentryOptions`
  wires into `beforeSend`; the rest are exported for unit testing and for
  any call site that wants to scrub a string before it ever reaches an
  `Event` (e.g. a log line).
- **`browserNoiseFilter`** / `isBrowserNoiseEvent` — a short, documented
  list of known extension/ad-blocker frames (`chrome-extension://`,
  `moz-extension://`, `safari-extension://`) and hydration-mismatch-message
  duplicates to drop client-side. Not wired into `buildSentryOptions`
  automatically (it would be wrong on the server, where there is no
  browser); pass it via `extraBeforeSend` from client-only init code:

  ```ts
  buildSentryOptions({ service, environment, dsn, extraBeforeSend: [browserNoiseFilter] });
  ```
- **`composeBeforeSend`** — chains `beforeSend`-shaped functions left to
  right, short-circuiting once one drops the event (returns `null`). Used
  internally by `buildSentryOptions`; exported for consumers who need to add
  their own scrubbing/filtering beyond `extraBeforeSend`.
- **`alert`** — see above.

## How each surface consumes it (later phases)

- `apps/platform` and `apps/schedule-builder`: `sentry.server.config.ts` /
  `instrumentation.ts` / `instrumentation-client.ts` call
  `buildSentryOptions` and pass the result to their respective
  `@sentry/nextjs` / `@sentry/cloudflare` `init()`. Cron routes and
  `ScrapeWorkflow` wrap with Sentry Crons check-ins. Alert call sites swap
  `postAlert(...)` for `alert(...)`.
- `apps/sandbox`: same shape as the two Next apps, scoped to the `sandbox`
  service.
- `packages/devtools`: a Node CLI init using `@sentry/node`, environment
  `"ci"` in CI and `"local"` otherwise (see `ENVIRONMENTS`).
