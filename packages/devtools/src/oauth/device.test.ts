import { describe, expect, it, vi } from "vitest";
import { pollForToken, requestDeviceCode } from "./device.js";

const platformUrl = "https://devdogsuga.org";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
  });
}

describe("requestDeviceCode", () => {
  it("posts to /oauth/device/code and returns the device code fields", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://devdogsuga.org/oauth/device/code");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init?.body as string)).toEqual({
        label: "my-project",
        callback_uri: "http://localhost:54321/auth/v1/callback",
      });
      return jsonResponse({
        device_code: "devcode-1",
        user_code: "ABCD-EFGH",
        verification_uri: "https://devdogsuga.org/device",
        verification_uri_complete:
          "https://devdogsuga.org/device?user_code=ABCD-EFGH",
        expires_in: 900,
        interval: 5,
      });
    });

    const result = await requestDeviceCode({
      platformUrl,
      label: "my-project",
      callbackUri: "http://localhost:54321/auth/v1/callback",
      fetchImpl,
    });

    expect(result).toEqual({
      deviceCode: "devcode-1",
      userCode: "ABCD-EFGH",
      verificationUri: "https://devdogsuga.org/device",
      verificationUriComplete:
        "https://devdogsuga.org/device?user_code=ABCD-EFGH",
      expiresIn: 900,
      interval: 5,
    });
  });

  it("throws a network DeviceError when fetch itself fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(
      requestDeviceCode({
        platformUrl,
        label: "l",
        callbackUri: "c",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("reports 400 invalid_request", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "invalid_request",
            error_description: "bad label",
          }),
          { status: 400 },
        ),
    );

    await expect(
      requestDeviceCode({
        platformUrl,
        label: "l",
        callbackUri: "c",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "invalid_request" });
  });

  it("reports 429 as rate_limited and carries Retry-After", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "retry-after": "12" },
        }),
    );

    await expect(
      requestDeviceCode({
        platformUrl,
        label: "l",
        callbackUri: "c",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "rate_limited", retryAfterSeconds: 12 });
  });

  it("reports a 200 body missing required fields as malformed", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ device_code: "only-this" }),
    );

    await expect(
      requestDeviceCode({
        platformUrl,
        label: "l",
        callbackUri: "c",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "malformed" });
  });
});

/** A no-op `sleep` — tests never wait on the real clock. */
const noSleep = vi.fn(async () => undefined);

/** A `now()` that starts at 0 and advances by `stepMs` on every call after the first. */
function fakeClock(stepMs: number): () => number {
  let t = 0;
  let first = true;
  return () => {
    if (first) {
      first = false;
      return t;
    }
    t += stepMs;
    return t;
  };
}

const baseArgs = {
  platformUrl,
  deviceCode: "devcode-1",
  intervalSeconds: 5,
  expiresInSeconds: 900,
};

describe("pollForToken", () => {
  it("returns the credentials on an immediate 200", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://devdogsuga.org/oauth/device/token");
      expect(JSON.parse(init?.body as string)).toEqual({
        device_code: "devcode-1",
      });
      return jsonResponse({
        client_id: "cid",
        client_secret: "csecret",
        issuer: "iss",
      });
    });

    const result = await pollForToken({
      ...baseArgs,
      fetchImpl,
      sleep: noSleep,
    });
    expect(result).toEqual({
      clientId: "cid",
      clientSecret: "csecret",
      issuer: "iss",
    });
    expect(noSleep).toHaveBeenCalledWith(5000);
  });

  it("keeps polling through authorization_pending until approval", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(
          JSON.stringify({ error: "authorization_pending" }),
          {
            status: 400,
          },
        );
      }
      return jsonResponse({
        client_id: "cid",
        client_secret: "csecret",
        issuer: "iss",
      });
    });

    const result = await pollForToken({
      ...baseArgs,
      fetchImpl,
      sleep: noSleep,
    });
    expect(result).toEqual({
      clientId: "cid",
      clientSecret: "csecret",
      issuer: "iss",
    });
    expect(calls).toBe(3);
  });

  it("slow_down adds 5 seconds to the poll interval and keeps polling", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "slow_down" }), {
          status: 400,
        });
      }
      return jsonResponse({
        client_id: "cid",
        client_secret: "csecret",
        issuer: "iss",
      });
    });

    await pollForToken({ ...baseArgs, intervalSeconds: 5, fetchImpl, sleep });

    // First sleep at the original 5s interval, second at 5+5=10s after slow_down.
    expect(sleep.mock.calls[0]).toEqual([5000]);
    expect(sleep.mock.calls[1]).toEqual([10000]);
  });

  it("throws access_denied and stops polling", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "access_denied",
            error_description: "user declined",
          }),
          { status: 400 },
        ),
    );

    await expect(
      pollForToken({ ...baseArgs, fetchImpl, sleep: noSleep }),
    ).rejects.toMatchObject({ kind: "access_denied" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws expired_token when the server reports it", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "expired_token" }), {
          status: 400,
        }),
    );

    await expect(
      pollForToken({ ...baseArgs, fetchImpl, sleep: noSleep }),
    ).rejects.toMatchObject({ kind: "expired_token" });
  });

  it("throws expired_token locally once expiresInSeconds elapses, without waiting on the server", async () => {
    const fetchImpl = vi.fn(async () => {
      // Always pending — the LOCAL deadline is what ends this, not the server.
      return new Response(JSON.stringify({ error: "authorization_pending" }), {
        status: 400,
      });
    });
    // Each `now()` call advances 1000ms; expiresInSeconds is 2s, so the
    // deadline trips after a couple of poll iterations.
    const now = fakeClock(1000);

    await expect(
      pollForToken({
        ...baseArgs,
        intervalSeconds: 1,
        expiresInSeconds: 2,
        fetchImpl,
        sleep: noSleep,
        now,
      }),
    ).rejects.toMatchObject({ kind: "expired_token" });
  });

  it("throws invalid_grant", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
        }),
    );

    await expect(
      pollForToken({ ...baseArgs, fetchImpl, sleep: noSleep }),
    ).rejects.toMatchObject({ kind: "invalid_grant" });
  });

  it("waits out Retry-After on a 429 and keeps polling", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "retry-after": "20" },
        });
      }
      return jsonResponse({
        client_id: "cid",
        client_secret: "csecret",
        issuer: "iss",
      });
    });

    const result = await pollForToken({ ...baseArgs, fetchImpl, sleep });
    expect(result).toEqual({
      clientId: "cid",
      clientSecret: "csecret",
      issuer: "iss",
    });
    expect(sleep.mock.calls).toContainEqual([20000]);
  });

  it("retries a handful of network failures with backoff before failing", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });

    await expect(
      pollForToken({ ...baseArgs, fetchImpl, sleep }),
    ).rejects.toMatchObject({ kind: "network" });

    // MAX_NETWORK_RETRIES + 1 attempts total (the original try plus retries).
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("recovers from a transient network failure once the network comes back", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("ECONNRESET");
      return jsonResponse({
        client_id: "cid",
        client_secret: "csecret",
        issuer: "iss",
      });
    });

    const result = await pollForToken({
      ...baseArgs,
      fetchImpl,
      sleep: noSleep,
    });
    expect(result).toEqual({
      clientId: "cid",
      clientSecret: "csecret",
      issuer: "iss",
    });
  });
});
