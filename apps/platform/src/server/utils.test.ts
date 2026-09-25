import { describe, expect, it, vi } from "vitest";

// `~/env` validates the FULL schema (server + client) at import time, which
// under bare Vitest -- no Next build step to inline the `NEXT_PUBLIC_*`
// vars -- throws before this file's `describe` block even registers. Every
// other test that reaches `~/env` transitively either mocks it the same way
// (see `~/server/email/send.test.ts`) or only runs under `test:db`'s
// `with-env`-loaded real environment. `callbackPathSchema` only reads
// `BASE_URL`, so a stub with just that field is enough.
vi.mock("~/env", () => ({ env: { BASE_URL: "http://localhost:3000" } }));

const { callbackPathSchema } = await import("./utils");

describe("callbackPathSchema", () => {
  it("passes a plain path through unchanged", async () => {
    await expect(callbackPathSchema.parseAsync("/tools/oauth")).resolves.toBe(
      "/tools/oauth",
    );
  });

  it("preserves a query string, e.g. the OAuth connect handoff's params", async () => {
    const path =
      "/tools/oauth/connect?redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback&code_challenge=abc123&code_challenge_method=S256&state=xyz&label=my-project&callback_uri=https%3A%2F%2Fexample.supabase.co%2Fauth%2Fv1%2Fcallback";
    await expect(callbackPathSchema.parseAsync(path)).resolves.toBe(path);
  });

  it("preserves a hash fragment alongside a query string", async () => {
    await expect(
      callbackPathSchema.parseAsync("/account?tab=links#connectedAccounts"),
    ).resolves.toBe("/account?tab=links#connectedAccounts");
  });

  // `new URL(path, BASE_URL)` resolves a scheme-relative (`//host/...`) or
  // fully-qualified foreign URL against BASE_URL like any browser would --
  // `url.origin` then comes back as THAT host, not this app's. Stripping
  // `url.origin` from `url.toString()` throws the host away regardless of
  // which one it was, which is what keeps a value like these from becoming
  // an open redirect: the result is always a same-origin path, never a
  // cross-origin location.
  it("strips a scheme-relative host down to a same-origin path", async () => {
    await expect(
      callbackPathSchema.parseAsync("//evil.example/steal"),
    ).resolves.toBe("/steal");
  });

  it("strips a fully-qualified foreign URL down to a same-origin path", async () => {
    await expect(
      callbackPathSchema.parseAsync("https://evil.example/steal?x=1"),
    ).resolves.toBe("/steal?x=1");
  });

  it("rejects a non-string value", async () => {
    // `new URL` is too lenient to reject much of anything once it has a
    // base to resolve against (even a stray null byte just gets percent-
    // encoded) -- the schema's `z.string()` base is what actually rejects
    // malformed input, before the transform ever runs.
    await expect(callbackPathSchema.parseAsync(undefined)).rejects.toThrow();
  });
});
