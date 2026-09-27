import { describe, expect, it } from "vitest";
import type { FetchLike } from "./checks.js";
import {
  checkCronMonitorCheckins,
  checkSentryRelease,
  resolveSentryConfig,
  skippedSentryCheck,
} from "./sentry.js";

function stubFetch(
  handler: (url: string) => { status: number; body?: unknown },
): FetchLike {
  return async (url) => {
    const { status, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body,
    };
  };
}

describe("resolveSentryConfig", () => {
  it("is undefined when SENTRY_AUTH_TOKEN is absent", () => {
    expect(
      resolveSentryConfig({
        SENTRY_ORG: "devdogsuga",
        SENTRY_PROJECT: "platform",
      }),
    ).toBeUndefined();
  });

  it("is undefined when org or project is missing even with a token", () => {
    expect(resolveSentryConfig({ SENTRY_AUTH_TOKEN: "x" })).toBeUndefined();
  });

  it("resolves when all three are present", () => {
    expect(
      resolveSentryConfig({
        SENTRY_AUTH_TOKEN: "x",
        SENTRY_ORG: "devdogsuga",
        SENTRY_PROJECT: "platform",
      }),
    ).toEqual({ authToken: "x", org: "devdogsuga", project: "platform" });
  });
});

describe("skippedSentryCheck", () => {
  it("is a skip, never a failure", () => {
    const result = skippedSentryCheck("Sentry release");
    expect(result.status).toBe("skip");
  });
});

const config = { org: "devdogsuga", project: "platform", authToken: "x" };

describe("checkSentryRelease", () => {
  it("passes when the API answers 200", async () => {
    const result = await checkSentryRelease(
      config,
      "abc123",
      stubFetch(() => ({ status: 200 })),
    );
    expect(result.status).toBe("pass");
  });

  it("fails when the release is not found", async () => {
    const result = await checkSentryRelease(
      config,
      "abc123",
      stubFetch(() => ({ status: 404 })),
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("404");
  });
});

describe("checkCronMonitorCheckins", () => {
  it("passes when at least one check-in is on record", async () => {
    const result = await checkCronMonitorCheckins(
      config,
      "platform-cron-config-reconcile",
      stubFetch(() => ({ status: 200, body: [{ id: "1" }] })),
    );
    expect(result.status).toBe("pass");
  });

  it("fails when the check-in list is empty", async () => {
    const result = await checkCronMonitorCheckins(
      config,
      "platform-cron-config-reconcile",
      stubFetch(() => ({ status: 200, body: [] })),
    );
    expect(result.status).toBe("fail");
  });

  it("fails on a non-2xx status", async () => {
    const result = await checkCronMonitorCheckins(
      config,
      "platform-cron-config-reconcile",
      stubFetch(() => ({ status: 403 })),
    );
    expect(result.status).toBe("fail");
  });
});
