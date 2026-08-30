import { describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", () => ({
  log: { warn: vi.fn() },
}));

import { isRateLimited, withRateLimitRetry } from "./retry.js";

const LIMITED = new Error(
  "Received error message from server: [429 Too Many Requests]",
);

describe("withRateLimitRetry", () => {
  it("retries a 429 with doubling waits, then succeeds", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRateLimitRetry(
      async () => {
        calls++;
        if (calls < 3) throw LIMITED;
        return "ok";
      },
      {
        doing: "the login",
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    );
    expect(result).toBe("ok");
    expect(waits).toEqual([5_000, 10_000]);
  });

  it("gives up after the retries and throws the LAST 429", async () => {
    const op = vi.fn(async () => {
      throw LIMITED;
    });
    await expect(
      withRateLimitRetry(op, { doing: "a write", sleep: async () => {} }),
    ).rejects.toThrow(/429/);
    // First attempt + three retries.
    expect(op).toHaveBeenCalledTimes(4);
  });

  it("⚠️ never retries anything but a rate limit", async () => {
    // Retrying a bad token or a missing project just triples the time to the
    // real message, and retrying a WRITE that failed for an unknown reason
    // is how one secret becomes three.
    const op = vi.fn(async () => {
      throw new Error("401 Unauthorized");
    });
    await expect(
      withRateLimitRetry(op, { doing: "a write", sleep: async () => {} }),
    ).rejects.toThrow(/401/);
    expect(op).toHaveBeenCalledTimes(1);
  });
});

describe("isRateLimited", () => {
  it("matches the shapes Bitwarden and GitHub actually produce", () => {
    expect(isRateLimited(LIMITED)).toBe(true);
    expect(isRateLimited(new Error("Too Many Requests"))).toBe(true);
    expect(isRateLimited(new Error("You have been rate limited."))).toBe(true);
    expect(isRateLimited(new Error("404 Not Found"))).toBe(false);
    // 429 as a substring of something longer must not false-positive.
    expect(isRateLimited(new Error("secret 4290 updated"))).toBe(false);
  });
});
