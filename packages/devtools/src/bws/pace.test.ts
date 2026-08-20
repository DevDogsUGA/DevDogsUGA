import { describe, expect, it } from "vitest";
import { READ_GAP_MS, WRITE_GAP_MS, makePacer } from "./pace.js";

/**
 * Deterministic: injected clock and sleep. The clock only advances when the
 * fake sleep is told to wait, so every asserted gap is arithmetic, not
 * timing.
 */
function harness() {
  let clock = 0;
  const sleeps: number[] = [];
  const pace = makePacer(
    () => clock,
    async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  );
  return { pace, sleeps, time: () => clock };
}

describe("makePacer", () => {
  it("lets the first call through untouched", async () => {
    const { pace, sleeps } = harness();
    await pace("write");
    expect(sleeps).toEqual([]);
  });

  it("holds a write behind a write by the full write gap", async () => {
    const { pace, sleeps } = harness();
    await pace("write");
    await pace("write");
    expect(sleeps).toEqual([WRITE_GAP_MS]);
  });

  it("⚠️ makes the gap the PREVIOUS call's kind, not the next one's", async () => {
    // The limiter counts requests from this IP; a read fired hard on the
    // heels of a write is still a request inside the write's minute-budget
    // window. Reserving the gap when the call starts is what encodes that.
    const { pace, sleeps } = harness();
    await pace("write");
    await pace("read");
    expect(sleeps).toEqual([WRITE_GAP_MS]);
  });

  it("spaces reads by the read gap only", async () => {
    const { pace, sleeps } = harness();
    await pace("read");
    await pace("read");
    await pace("read");
    expect(sleeps).toEqual([READ_GAP_MS, READ_GAP_MS]);
  });

  it("charges nothing when the caller was already slower than the gap", async () => {
    // A slow SDK call is its own spacing; the pacer only tops UP to the gap.
    let clock = 0;
    const sleeps: number[] = [];
    const pace = makePacer(
      () => clock,
      async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    );
    await pace("write");
    clock += WRITE_GAP_MS + 200; // the call itself outlasted the gap
    await pace("write");
    expect(sleeps).toEqual([]);
  });

  it("queues concurrent callers instead of letting them race the clock", async () => {
    const { pace, sleeps } = harness();
    await Promise.all([pace("write"), pace("write"), pace("write")]);
    expect(sleeps).toEqual([WRITE_GAP_MS, WRITE_GAP_MS]);
  });
});
