/**
 * Shared prompt plumbing.
 *
 * The audience here is a contributor who may not be comfortable in a terminal
 * at all, so two rules apply throughout:
 *
 *   * Nothing requires knowing a command. Running `pnpm devtools` with no
 *     arguments opens a menu, and every prompt has a sensible default.
 *   * A failure says what to do next, not just what went wrong. `explain()`
 *     exists so that no error path ends at a stack trace.
 */
import { cancel, isCancel, log, note } from "@clack/prompts";

export function bail(message = "Cancelled."): never {
  cancel(message);
  process.exit(1);
}

/** Exits cleanly on Ctrl-C rather than letting a cancel symbol leak onward. */
export function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) bail();
  return value as T;
}

/**
 * Reports a failure with the next thing to try.
 *
 * `hints` is not decoration: for most of these failures the fix is one command,
 * and printing it is the difference between a contributor continuing and a
 * contributor asking in Discord.
 */
export function explain(
  summary: string,
  detail: string,
  hints: string[] = [],
): void {
  log.error(summary);
  if (detail) log.message(detail);
  if (hints.length > 0) note(hints.join("\n"), "Try this");
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Result rendering ─────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * A pass/fail list.
 *
 * Deliberately plain text rather than a box-drawing table: these lines get
 * pasted into Discord and GitHub issues, where anything fancier turns to
 * rubble.
 */
export function renderChecks(checks: CheckResult[]): string {
  return checks
    .map((c) => `${c.ok ? "PASS" : "FAIL"}  ${c.name}\n      ${c.detail}`)
    .join("\n");
}
