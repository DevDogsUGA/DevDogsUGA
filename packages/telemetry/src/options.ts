import type { ErrorEvent, EventHint, Options as SentryOptions } from "@sentry/core";
import {
  ERROR_SAMPLE_RATE,
  TAG_KEYS,
  tracesSampleRateFor,
  type Service,
} from "./constants.js";
import { scrubEvent } from "./scrub.js";

export type BeforeSend = (
  event: ErrorEvent,
  hint: EventHint,
) => ErrorEvent | null;

/**
 * Chains `beforeSend`-shaped functions left to right, short-circuiting the
 * moment one drops the event. Used to compose the shared scrubbers with a
 * consumer's own additions (e.g. {@link browserNoiseFilter} on the browser
 * side only) without every consumer re-implementing the chaining.
 */
export function composeBeforeSend(...fns: BeforeSend[]): BeforeSend {
  return (event, hint) => {
    let current: ErrorEvent | null = event;
    for (const fn of fns) {
      if (current === null) return null;
      current = fn(current, hint);
    }
    return current;
  };
}

export interface BuildSentryOptionsInput {
  /** Which of the four Sentry projects this init call belongs to. */
  service: Service;
  /** Deploy environment string — becomes the Sentry `environment` tag. */
  environment: string;
  /**
   * The project's DSN. Pass the raw env var straight through — falsy
   * (`undefined`, `null`, `""`) means "not configured," and this function
   * returns `undefined` in that case so the caller can skip `Sentry.init`
   * entirely rather than initializing with an empty string.
   */
  dsn: string | undefined | null;
  /** Passed through unchanged; set this from the release env var/git SHA. */
  release?: string;
  /**
   * Extra `beforeSend`-shaped functions to run after the shared scrubbers,
   * e.g. {@link browserNoiseFilter} for a browser-only init call.
   */
  extraBeforeSend?: BeforeSend[];
}

/**
 * The options every `Sentry.init()` call in the workspace shares: DSN,
 * environment, release passthrough, the sample-rate table, Sentry Logs, PII
 * off by default, and the scrubbing `beforeSend` chain.
 *
 * Returns `undefined` when `dsn` is falsy, so every consumer can write
 * `const opts = buildSentryOptions(...); if (opts) Sentry.init(opts);` and
 * no-op cleanly with no DSN configured (the normal case in local dev).
 *
 * The return type is `@sentry/core`'s `Options` (`CoreOptions`) — the
 * options shape shared by `@sentry/node`, `@sentry/cloudflare`, and
 * `@sentry/nextjs`'s `init()` calls alike, so this same object is valid
 * input to any of them.
 */
export function buildSentryOptions({
  service,
  environment,
  dsn,
  release,
  extraBeforeSend = [],
}: BuildSentryOptionsInput): SentryOptions | undefined {
  if (!dsn) return undefined;

  return {
    dsn,
    environment,
    release,
    tracesSampleRate: tracesSampleRateFor(environment),
    sampleRate: ERROR_SAMPLE_RATE,
    enableLogs: true,
    // Each category is opted into individually via `beforeSend`'s scrubbers
    // rather than blanket-enabled; see packages/telemetry/README.md.
    sendDefaultPii: false,
    initialScope: {
      tags: { [TAG_KEYS.SERVICE]: service },
    },
    beforeSend: composeBeforeSend(scrubEvent, ...extraBeforeSend),
  };
}
