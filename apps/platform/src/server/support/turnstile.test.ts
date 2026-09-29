import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_ACTION } from "~/lib/support/types";

/** `verifyTurnstile` against a faked siteverify, never the network. */

const appEnv = {
  DEPLOY_ENV: "production",
  BASE_URL: "https://devdogsuga.org",
  TURNSTILE_SECRET_KEY: "secret",
};

vi.mock("~/env", () => ({ env: appEnv }));

const { verifyTurnstile } = await import("./turnstile");

function siteverify(result: object | Error, status = 200) {
  const fetch = vi.fn(() =>
    result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(Response.json(result, { status })),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

// Shaped like a live response, `metadata` included.
const pass = {
  success: true,
  action: TURNSTILE_ACTION,
  hostname: "devdogsuga.org",
  "error-codes": [],
  metadata: { interactive: false },
};

afterEach(() => {
  vi.unstubAllGlobals();
  appEnv.DEPLOY_ENV = "production";
});

describe("verifyTurnstile", () => {
  it("accepts a pass for our action on BASE_URL's hostname", async () => {
    const fetch = siteverify(pass);
    expect(await verifyTurnstile("token", "203.0.113.7")).toBe(true);

    const body = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const sent = body[1].body as URLSearchParams;
    expect(sent.get("response")).toBe("token");
    expect(sent.get("remoteip")).toBe("203.0.113.7");
  });

  it.each([
    ["a failed check", { ...pass, success: false }],
    ["another action", { ...pass, action: "login" }],
    ["another hostname", { ...pass, hostname: "staging.devdogsuga.org" }],
    ["no action at all", { success: true, hostname: "devdogsuga.org" }],
  ])("refuses %s", async (_, result) => {
    siteverify(result);
    expect(await verifyTurnstile("token", null)).toBe(false);
  });

  it("fails closed when siteverify is unreachable or errors", async () => {
    siteverify(new Error("network"));
    expect(await verifyTurnstile("token", null)).toBe(false);
    siteverify(pass, 500);
    expect(await verifyTurnstile("token", null)).toBe(false);
  });

  it("accepts Cloudflare's test keys locally and nowhere else", async () => {
    const testing = {
      success: true,
      hostname: "example.com",
      metadata: { result_with_testing_key: true },
    };
    siteverify(testing);
    expect(await verifyTurnstile("token", null)).toBe(false);

    appEnv.DEPLOY_ENV = "development";
    siteverify(testing);
    expect(await verifyTurnstile("token", null)).toBe(true);
  });

  it("refuses an empty token without calling siteverify", async () => {
    const fetch = siteverify(pass);
    expect(await verifyTurnstile("", null)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
