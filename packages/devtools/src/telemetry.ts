/**
 * devtools' own Sentry wiring — the CLI is a consumer of
 * `@devdogsuga/telemetry` like `apps/platform`, `apps/schedule-builder`, and
 * `apps/sandbox`, but on `@sentry/node` rather than a framework SDK: a CLI
 * process starts, runs one command, and exits, with none of a server's
 * request lifecycle for a framework integration to hook into.
 *
 * ## Reporting is on by default
 *
 * Every other `*_SENTRY_DSN` in this workspace is optional-and-empty until
 * an org exists to receive it (see `@devdogsuga/telemetry`'s no-op-without-
 * DSN contract). `DEVTOOLS_SENTRY_DSN` follows the same contract — empty
 * means `buildSentryOptions` returns `undefined` and `Sentry.init` never
 * runs — but the DEFAULT here is reporting ON once a DSN exists, unlike a
 * feature a contributor opts into. `DEVTOOLS_TELEMETRY=0` is the one escape
 * hatch, checked before `Sentry.init` and before every capture call, so it
 * also works as a kill switch after init already ran (a long-lived `pnpm
 * devtools` menu session, for instance).
 *
 * `PLACEHOLDER_DEVTOOLS_SENTRY_DSN` is committed empty on purpose: the
 * devtools Sentry project does not exist yet. Once it does, either replace
 * this constant with the real ingest DSN or — preferably — set
 * `DEVTOOLS_SENTRY_DSN` in the environment, which always wins over the
 * placeholder. Either way, an empty result here is indistinguishable from
 * "not configured": no init, no network call, no console spam, which is the
 * whole point of shipping this file before the org is onboarded.
 */
import * as Sentry from "@sentry/node";
import { buildSentryOptions } from "@devdogsuga/telemetry";

// ⚠️ PLACEHOLDER — see this file's header. Leave empty until the devtools
// Sentry project exists.
const PLACEHOLDER_DEVTOOLS_SENTRY_DSN = "";

let initialized = false;

/**
 * `'ci'` in every GitHub Actions job (`CI` is set by the runner itself,
 * before any workflow-authored env), `'local'` on a contributor's machine.
 * One of `@devdogsuga/telemetry`'s `ENVIRONMENTS`.
 */
export function devtoolsEnvironment(): "ci" | "local" {
  return process.env.CI ? "ci" : "local";
}

/**
 * `DEVTOOLS_TELEMETRY=0` (any other value, including unset, leaves reporting
 * on) is the only opt-out. Checked by both `initDevtoolsTelemetry` (skips
 * `Sentry.init` outright) and `captureDevtoolsError` (so setting it mid-run,
 * or between two invocations in the same process, still works).
 */
export function devtoolsTelemetryEnabled(): boolean {
  return process.env.DEVTOOLS_TELEMETRY !== "0";
}

/**
 * Initializes `@sentry/node` for this CLI process. Safe to call more than
 * once (idempotent) and safe to call with no DSN configured (no-ops via
 * `buildSentryOptions`, see its header).
 *
 * `command` becomes a `command` tag on every event this process reports, so
 * an issue in Sentry names the subcommand it came from (`db reset`,
 * `deploy platform`, …) without anyone opening the job log first.
 */
export function initDevtoolsTelemetry(command: string): void {
  if (initialized) return;
  initialized = true;

  if (!devtoolsTelemetryEnabled()) return;

  const dsn = process.env.DEVTOOLS_SENTRY_DSN || PLACEHOLDER_DEVTOOLS_SENTRY_DSN;
  const options = buildSentryOptions({
    service: "devtools",
    environment: devtoolsEnvironment(),
    dsn,
    release: process.env.SENTRY_RELEASE,
  });
  if (!options) return;

  Sentry.init(options);
  Sentry.getCurrentScope().setTag("command", command);
}

/**
 * Reports an uncaught error from the top-level `main().catch` in `cli.ts`
 * and `ci.ts` alike, then flushes before the process exits. Node's event
 * loop dies with `process.exit`, taking any in-flight request to Sentry's
 * ingest endpoint with it, so the flush must be awaited BEFORE that call —
 * never after.
 *
 * A short timeout: a CLI exiting on error should not hang perceptibly longer
 * because Sentry's ingest is slow or unreachable.
 */
export async function captureDevtoolsError(err: unknown): Promise<void> {
  if (!devtoolsTelemetryEnabled()) return;
  Sentry.captureException(err);
  await Sentry.flush(2000);
}
