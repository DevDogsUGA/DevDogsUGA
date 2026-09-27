import { describe, expect, it } from "vitest";
import { isMirrorStale, MIRROR_STALE_AFTER_MS } from "./mirrorFreshness";

describe("isMirrorStale", () => {
  const now = new Date("2026-09-23T12:00:00Z");

  it("is stale when never synced", () => {
    expect(isMirrorStale(null, now)).toBe(true);
  });

  it("is not stale just under the threshold", () => {
    const synced = new Date(now.getTime() - MIRROR_STALE_AFTER_MS + 1000);
    expect(isMirrorStale(synced, now)).toBe(false);
  });

  it("is stale just over the threshold", () => {
    const synced = new Date(now.getTime() - MIRROR_STALE_AFTER_MS - 1000);
    expect(isMirrorStale(synced, now)).toBe(true);
  });

  it("is not stale for a sync that just happened", () => {
    expect(isMirrorStale(now, now)).toBe(false);
  });
});
