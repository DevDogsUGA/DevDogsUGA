import { describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/core";
import { buildSentryOptions, composeBeforeSend } from "./options.js";

describe("buildSentryOptions", () => {
  it("returns undefined when the DSN is falsy", () => {
    expect(
      buildSentryOptions({
        service: "platform",
        environment: "production",
        dsn: undefined,
      }),
    ).toBeUndefined();
    expect(
      buildSentryOptions({
        service: "platform",
        environment: "production",
        dsn: null,
      }),
    ).toBeUndefined();
    expect(
      buildSentryOptions({
        service: "platform",
        environment: "production",
        dsn: "",
      }),
    ).toBeUndefined();
  });

  it("builds the shared options when a DSN is present", () => {
    const opts = buildSentryOptions({
      service: "platform",
      environment: "production",
      dsn: "https://key@o1.ingest.sentry.io/1",
      release: "abc123",
    });

    expect(opts).toBeDefined();
    expect(opts?.dsn).toBe("https://key@o1.ingest.sentry.io/1");
    expect(opts?.environment).toBe("production");
    expect(opts?.release).toBe("abc123");
    expect(opts?.tracesSampleRate).toBe(0.2);
    expect(opts?.sampleRate).toBe(1);
    expect(opts?.enableLogs).toBe(true);
    expect(opts?.sendDefaultPii).toBe(false);
    expect(opts?.initialScope).toEqual({ tags: { service: "platform" } });
  });

  it("derives tracesSampleRate from the environment", () => {
    const staging = buildSentryOptions({
      service: "sandbox",
      environment: "staging",
      dsn: "https://key@o1.ingest.sentry.io/1",
    });
    const dev = buildSentryOptions({
      service: "sandbox",
      environment: "development",
      dsn: "https://key@o1.ingest.sentry.io/1",
    });

    expect(staging?.tracesSampleRate).toBe(0.05);
    expect(dev?.tracesSampleRate).toBe(0);
  });

  it("scrubs events through the built beforeSend", () => {
    const opts = buildSentryOptions({
      service: "devtools",
      environment: "ci",
      dsn: "https://key@o1.ingest.sentry.io/1",
    });

    const event: ErrorEvent = {
      type: undefined,
      message: "failed for hello@sloanfinger.com",
    };
    const result = opts?.beforeSend?.(event, {});
    expect(result).toEqual({ message: "failed for [redacted-email]" });
  });

  it("chains extraBeforeSend after the shared scrubbers", () => {
    const opts = buildSentryOptions({
      service: "platform",
      environment: "production",
      dsn: "https://key@o1.ingest.sentry.io/1",
      extraBeforeSend: [() => null],
    });

    const event: ErrorEvent = { type: undefined, message: "boom" };
    expect(opts?.beforeSend?.(event, {})).toBeNull();
  });
});

describe("composeBeforeSend", () => {
  it("runs functions left to right", () => {
    const order: string[] = [];
    const fn = composeBeforeSend(
      (event) => {
        order.push("first");
        return event;
      },
      (event) => {
        order.push("second");
        return event;
      },
    );

    const event: ErrorEvent = { type: undefined };
    fn(event, {});
    expect(order).toEqual(["first", "second"]);
  });

  it("short-circuits once a function drops the event", () => {
    const second = vi.fn((event: ErrorEvent) => event);
    const fn = composeBeforeSend(() => null, second);

    expect(fn({ type: undefined }, {})).toBeNull();
    expect(second).not.toHaveBeenCalled();
  });

  it("with no functions, returns the event unchanged", () => {
    const fn = composeBeforeSend();
    const event: ErrorEvent = { type: undefined, message: "hi" };
    expect(fn(event, {})).toBe(event);
  });
});
