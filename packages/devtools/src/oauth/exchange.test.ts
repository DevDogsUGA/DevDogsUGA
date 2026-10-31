import { afterEach, describe, expect, it, vi } from "vitest";
import { ExchangeError, exchangeCode } from "./exchange.js";

const args = {
  platformUrl: "https://devdogsuga.org",
  code: "abc",
  codeVerifier: "def",
};

describe("exchangeCode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /oauth/connect/exchange and returns the credentials", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://devdogsuga.org/oauth/connect/exchange");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init?.body as string)).toEqual({
        code: "abc",
        code_verifier: "def",
      });
      return new Response(
        JSON.stringify({
          client_id: "cid",
          client_secret: "csecret",
          issuer: "https://crhqsbngqmwtsplabmhj.supabase.co/auth/v1",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeCode(args);
    expect(result).toEqual({
      clientId: "cid",
      clientSecret: "csecret",
      issuer: "https://crhqsbngqmwtsplabmhj.supabase.co/auth/v1",
    });
  });

  it("throws a network ExchangeError when fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(exchangeCode(args)).rejects.toMatchObject({
      kind: "network",
    });
    await expect(exchangeCode(args)).rejects.toThrow(/ECONNREFUSED/);
  });

  it("distinguishes invalid_grant from other 400s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "code already used",
            }),
            { status: 400 },
          ),
      ),
    );

    await expect(exchangeCode(args)).rejects.toMatchObject({
      kind: "invalid_grant",
    });
  });

  it("reports a generic invalid_request 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_request" }), {
            status: 400,
          }),
      ),
    );

    await expect(exchangeCode(args)).rejects.toMatchObject({
      kind: "invalid_request",
    });
  });

  it("reports 429 as rate_limited and carries Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429,
            headers: { "retry-after": "30" },
          }),
      ),
    );

    await expect(exchangeCode(args)).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  it("reports malformed JSON distinctly from a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );

    await expect(exchangeCode(args)).rejects.toMatchObject({
      kind: "malformed",
    });
  });

  it("reports a 200 body missing required fields as malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ client_id: "cid" }), { status: 200 }),
      ),
    );

    await expect(exchangeCode(args)).rejects.toThrow(ExchangeError);
    await expect(exchangeCode(args)).rejects.toMatchObject({
      kind: "malformed",
    });
  });
});
