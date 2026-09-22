import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/core";
import { browserNoiseFilter, isBrowserNoiseEvent } from "./browser-filter.js";

function eventWithFrame(filename: string): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [{ type: "Error", stacktrace: { frames: [{ filename }] } }],
    },
  };
}

describe("isBrowserNoiseEvent", () => {
  it("flags a chrome-extension frame", () => {
    expect(
      isBrowserNoiseEvent(
        eventWithFrame("chrome-extension://abc123/inject.js"),
      ),
    ).toBe(true);
  });

  it("flags a moz-extension frame", () => {
    expect(
      isBrowserNoiseEvent(eventWithFrame("moz-extension://abc123/inject.js")),
    ).toBe(true);
  });

  it("flags a hydration-mismatch message", () => {
    expect(
      isBrowserNoiseEvent({
        type: undefined,
        message: "Hydration failed because the initial UI does not match",
      }),
    ).toBe(true);
  });

  it("does not flag an ordinary application error", () => {
    expect(isBrowserNoiseEvent(eventWithFrame("/app/src/foo.js"))).toBe(false);
    expect(isBrowserNoiseEvent({ type: undefined, message: "boom" })).toBe(
      false,
    );
  });
});

describe("browserNoiseFilter", () => {
  it("drops a noisy event", () => {
    expect(
      browserNoiseFilter(eventWithFrame("chrome-extension://abc/x.js")),
    ).toBeNull();
  });

  it("passes an ordinary event through unchanged", () => {
    const event = eventWithFrame("/app/src/foo.js");
    expect(browserNoiseFilter(event)).toBe(event);
  });
});
