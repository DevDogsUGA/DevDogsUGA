import { describe, expect, it } from "vitest";
import type { SupportThread } from "~/lib/support/types";
import { pollInterval } from "./api";

const NOW = Date.parse("2026-09-29T12:00:00Z");

function threadWithNewestAt(minutesAgo: number): SupportThread {
  return {
    messages: [
      { createdAt: new Date(NOW - minutesAgo * 60_000).toISOString() },
    ],
  } as unknown as SupportThread;
}

describe("pollInterval", () => {
  it("polls every ten seconds while the conversation is live", () => {
    expect(pollInterval(threadWithNewestAt(1), NOW)).toBe(10_000);
  });

  it("backs off once the thread goes quiet", () => {
    expect(pollInterval(threadWithNewestAt(5), NOW)).toBe(30_000);
    expect(pollInterval(threadWithNewestAt(60), NOW)).toBe(60_000);
  });

  it("uses the slowest rate before anything has loaded", () => {
    expect(pollInterval(undefined, NOW)).toBe(60_000);
  });
});
