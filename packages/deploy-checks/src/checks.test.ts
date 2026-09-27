import { describe, expect, it } from "vitest";
import {
  allPassed,
  checkProtectedRedirect,
  checkPublicRoute,
  checkReconcile,
  formatResults,
  type FetchLike,
} from "./checks.js";

function stubFetch(
  handler: (url: string) => {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
  },
): FetchLike {
  return async (url) => {
    const { status, headers = {}, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: async () => body,
    };
  };
}

describe("checkPublicRoute", () => {
  it("passes on 200", async () => {
    const result = await checkPublicRoute(
      "https://devdogsuga.org/",
      stubFetch(() => ({ status: 200 })),
    );
    expect(result.status).toBe("pass");
  });

  it("fails on a non-200 status", async () => {
    const result = await checkPublicRoute(
      "https://devdogsuga.org/events",
      stubFetch(() => ({ status: 500 })),
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("500");
  });

  it("fails when the fetch itself throws", async () => {
    const result = await checkPublicRoute(
      "https://devdogsuga.org/",
      async () => {
        throw new Error("ECONNREFUSED");
      },
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("ECONNREFUSED");
  });
});

describe("checkProtectedRedirect", () => {
  it("passes when the redirect Location matches the expected prefix", async () => {
    const result = await checkProtectedRedirect(
      "https://devdogsuga.org/console/permissions",
      "/auth",
      stubFetch(() => ({
        status: 307,
        headers: { location: "https://devdogsuga.org/auth" },
      })),
    );
    expect(result.status).toBe("pass");
  });

  it("fails when the response is not a redirect", async () => {
    const result = await checkProtectedRedirect(
      "https://devdogsuga.org/console/permissions",
      "/auth",
      stubFetch(() => ({ status: 200 })),
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("200");
  });

  it("fails when the redirect Location does not match", async () => {
    const result = await checkProtectedRedirect(
      "https://devdogsuga.org/console/permissions",
      "/auth",
      stubFetch(() => ({ status: 307, headers: { location: "/" } })),
    );
    expect(result.status).toBe("fail");
  });

  it("matches a root-relative Location against the expected prefix", async () => {
    const result = await checkProtectedRedirect(
      "https://dogdays.dev/dashboard",
      "/",
      stubFetch(() => ({
        status: 307,
        headers: { location: "/?next=%2Fdashboard" },
      })),
    );
    expect(result.status).toBe("pass");
  });
});

describe("checkReconcile", () => {
  it("passes on { success: true }", async () => {
    const result = await checkReconcile(
      "https://devdogsuga.org/cron/config-reconcile",
      "secret",
      stubFetch(() => ({
        status: 200,
        body: { success: true, counts: { meetings: 3, workshops: 1 } },
      })),
    );
    expect(result.status).toBe("pass");
  });

  it("fails on 200 with { success: false } -- the case HTTP-status-only checks miss", async () => {
    const result = await checkReconcile(
      "https://devdogsuga.org/cron/config-reconcile",
      "secret",
      stubFetch(() => ({
        status: 200,
        body: { success: false, reason: "invalid_config_file" },
      })),
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("invalid_config_file");
  });

  it("fails on a non-2xx status", async () => {
    const result = await checkReconcile(
      "https://devdogsuga.org/cron/config-reconcile",
      "secret",
      stubFetch(() => ({ status: 401 })),
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("401");
  });
});

describe("allPassed", () => {
  it("is true when nothing failed, skips included", () => {
    expect(
      allPassed([
        { name: "a", status: "pass", detail: "" },
        { name: "b", status: "skip", detail: "" },
      ]),
    ).toBe(true);
  });

  it("is false when anything failed", () => {
    expect(
      allPassed([
        { name: "a", status: "pass", detail: "" },
        { name: "b", status: "fail", detail: "" },
      ]),
    ).toBe(false);
  });
});

describe("formatResults", () => {
  it("renders one line per result with a status marker", () => {
    const text = formatResults([{ name: "a", status: "fail", detail: "boom" }]);
    expect(text).toBe("[FAIL] a -- boom");
  });
});
