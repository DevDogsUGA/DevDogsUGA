import type { ErrorEvent, EventHint, Exception, StackFrame } from "@sentry/core";

/**
 * Pure scrubbing functions plus the `beforeSend` that composes them.
 *
 * Every function here operates on plain strings or a plain `Event` object —
 * no Sentry client, no network, nothing that needs a DSN to unit-test.
 */

// --- (a) absolute filesystem paths -> basenames --------------------------

// Matches POSIX absolute paths (/home/sloan/code/...) and Windows drive
// paths (C:\Users\...), each captured up to the next whitespace/quote/paren
// so a stack frame like "at /home/sloan/app/src/foo.ts:12:4" scrubs cleanly
// without eating the trailing line/column numbers.
// The lookbehind requires the leading "/" to start a token (start of string,
// or preceded by whitespace/quote/paren) so "src/foo.ts" in running prose —
// a relative path, not an absolute one — is left alone.
const POSIX_PATH =
  /(?<=^|[\s"'(<])\/(?:[^\s"'()<>:]+\/)+([^\s"'()<>:]+)/g;
const WINDOWS_PATH = /[A-Za-z]:\\(?:[^\s"'()<>]+\\)*([^\s"'()<>]+)/g;

/** Replaces absolute filesystem paths in `text` with just their basename. */
export function scrubPaths(text: string): string {
  return text.replace(WINDOWS_PATH, "$1").replace(POSIX_PATH, "$1");
}

// --- (b) email addresses ---------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Redacts anything that looks like an email address. */
export function scrubEmails(text: string): string {
  return text.replace(EMAIL, "[redacted-email]");
}

// --- (c) env-var assignments and bearer tokens -----------------------------

// KEY=value where KEY looks like an env var name (shouty snake case), and
// standalone `Bearer <token>` / `Authorization: <token>` values. Deliberately
// conservative: false negatives (a secret this misses) are safer to accept
// than false positives that mangle ordinary error text.
const ENV_ASSIGNMENT =
  /\b([A-Z][A-Z0-9_]{2,}(?:_KEY|_TOKEN|_SECRET|_PASSWORD)\w*)=[^\s"'`)]+/g;
const BEARER_TOKEN = /\b[Bb]earer\s+[A-Za-z0-9._-]+/g;

/** Redacts env-var-style assignments and bearer tokens. */
export function scrubSecrets(text: string): string {
  return text
    .replace(ENV_ASSIGNMENT, "$1=[redacted]")
    .replace(BEARER_TOKEN, "Bearer [redacted]");
}

/** Runs all three text scrubbers, in order. */
export function scrubText(text: string): string {
  return scrubSecrets(scrubEmails(scrubPaths(text)));
}

function scrubFrame(frame: StackFrame): StackFrame {
  return {
    ...frame,
    filename: frame.filename ? scrubText(frame.filename) : frame.filename,
    abs_path: frame.abs_path ? scrubText(frame.abs_path) : frame.abs_path,
    context_line: frame.context_line
      ? scrubText(frame.context_line)
      : frame.context_line,
  };
}

function scrubException(exception: Exception): Exception {
  return {
    ...exception,
    value: exception.value ? scrubText(exception.value) : exception.value,
    stacktrace: exception.stacktrace
      ? {
          ...exception.stacktrace,
          frames: exception.stacktrace.frames?.map(scrubFrame),
        }
      : exception.stacktrace,
  };
}

/**
 * Applies every scrubber to the parts of an event that carry free text:
 * the top-level message, each exception's message and stack frames, and
 * breadcrumb messages. Never returns `null` — this is a scrub, not a filter;
 * see {@link browserNoiseFilter} in `./browser-filter.ts` for dropping
 * events outright.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  return {
    ...event,
    message: event.message ? scrubText(event.message) : event.message,
    exception: event.exception
      ? { values: event.exception.values?.map(scrubException) }
      : event.exception,
    breadcrumbs: event.breadcrumbs?.map((crumb) =>
      crumb.message ? { ...crumb, message: scrubText(crumb.message) } : crumb,
    ),
  };
}
