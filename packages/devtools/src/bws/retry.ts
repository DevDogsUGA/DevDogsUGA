/**
 * Retrying exactly one failure class: HTTP 429, rate limiting.
 *
 * A 429 is the server saying "correct request, wrong minute", the only error
 * where trying the same thing again IS the fix. Everything else (bad token,
 * missing project, malformed input) re-throws untouched on the first attempt,
 * because retrying those just triples the time to the real message.
 *
 * Written for the Secrets Manager calls, where the minute matters: a push is
 * ~45 sequential writes plus a login, several targets get pushed back-to-back,
 * and Bitwarden's identity endpoint rate-limits repeated access-token logins
 * aggressively. The login half is also fixed at the source, since the client
 * now caches its login in a state file, so the retry is the belt on that
 * suspender.
 */
import { log } from "@clack/prompts";

export function isRateLimited(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b429\b|too many requests|rate.?limit/i.test(message);
}

export interface RetryOptions {
  /** Attempts AFTER the first. */
  retries?: number;
  /** First wait; doubles per retry (5s, 10s, 20s by default). */
  baseMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** What to call the operation in the wait message. */
  doing: string;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRateLimitRetry<T>(
  op: () => Promise<T>,
  { retries = 3, baseMs = 5_000, sleep = wait, doing }: RetryOptions,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (!isRateLimited(err) || attempt >= retries) throw err;
      const ms = baseMs * 2 ** attempt;
      // A silent 20-second stall reads as a hang, and a command that appears
      // hung gets Ctrl-C'd, turning a wait the server asked for into a
      // half-finished push.
      log.warn(
        `Bitwarden rate-limited ${doing} (HTTP 429). Waiting ${ms / 1000}s ` +
          `and retrying (${attempt + 1}/${retries})…`,
      );
      await sleep(ms);
    }
  }
}
