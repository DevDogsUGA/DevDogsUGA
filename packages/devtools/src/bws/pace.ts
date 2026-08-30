/**
 * Spacing Secrets Manager calls so the rate limit never fires.
 *
 * Bitwarden's published server config (enforced on cloud, per IP, per
 * endpoint) allows 60 POSTs and 200 GETs per minute and answers 429 beyond.
 * Community reports show burst enforcement tighter than that per-minute
 * arithmetic. The identity endpoint's login limit is undocumented and tighter
 * still; the state-file login cache is what handles that one. Researched
 * 2026-08-20: https://bitwarden-server.mintlify.app/services/api
 *
 * So writes (create, update, delete, login) start no closer than 1.1s apart,
 * 60/min with margin, and reads (list, getByIds) no closer than 350ms. A full
 * first push (~48 creates) takes a predictable ~55 seconds instead of a sprint
 * into a 429; later pushes touch few keys and barely notice. The 429 retry is
 * the backstop for whatever the undocumented parts still throw.
 *
 * One shared gate rather than one per class, and the write interval applies to
 * the gap after a write whatever follows it: the limiter cares about the
 * request stream from this IP, not our taxonomy of it.
 */

export type CallKind = "read" | "write";

export const WRITE_GAP_MS = 1_100;
export const READ_GAP_MS = 350;

export interface Pacer {
  (kind: CallKind): Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function makePacer(
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = wait,
): Pacer {
  let notBefore = 0;
  let chain = Promise.resolve();

  return (kind: CallKind) => {
    const gap = kind === "write" ? WRITE_GAP_MS : READ_GAP_MS;
    const turn = chain.then(async () => {
      const pause = notBefore - now();
      if (pause > 0) await sleep(pause);
      // The NEXT call may not start until this one's gap has passed.
      // Reserved before the call runs, so concurrent callers queue instead
      // of all measuring from the same stale timestamp.
      notBefore = now() + gap;
    });
    // The chain never rejects: a pacer that fails closed would wedge every
    // later call behind a rejection that had nothing to do with them.
    chain = turn.catch(() => {});
    return turn;
  };
}
