import { describe, expect, it } from "vitest";
import {
  apikeyParamNames,
  hashToken,
  isMemberToken,
  looksLikeJwt,
} from "./token";

/**
 * The half of the token agreement that lives at the edge.
 *
 * `hashToken` and the platform's `hashToken` must produce the SAME string or no
 * deployed token resolves. The platform pins external vectors for its copy
 * (apps/platform/src/server/sandbox/sandbox.test.ts) and says explicitly that
 * it does so to keep the two from drifting -- but this copy was unpinned, and
 * the security suite keys its resolve table by calling `hashToken` itself. Table
 * and lookup therefore moved together: switching to uppercase hex, base64url or
 * a salted digest kept every test green and would have failed every member with
 * "This member token is not valid for this environment."
 *
 * These vectors come from `node:crypto` rather than from this function.
 */
describe("hashToken", () => {
  it("matches published SHA-256 vectors", async () => {
    expect(await hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await hashToken("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the stored encoding for real member-token shapes", async () => {
    // Lowercase hex, unsalted, over the UTF-8 bytes of the whole token
    // including its prefix. Every one of those four choices is a way the two
    // sides could disagree, so each is pinned rather than described.
    expect(await hashToken("dd_publishable_aaaaaaaaaaaaaaaa")).toBe(
      "8647834d96b41160eb8772a1d3113ac85e21473885409acf21e1deaa9cb8ff47",
    );
    expect(await hashToken("dd_secret_bbbbbbbbbbbbbbbb")).toBe(
      "5c98d20500d776f659cd762939e3552d0c83932dd5fca2ef2b6a538e8fe71219",
    );
  });

  it("is lowercase hex of exactly 64 characters", async () => {
    expect(await hashToken("dd_secret_x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("looksLikeJwt", () => {
  it("accepts a three-segment base64url token", () => {
    expect(looksLikeJwt("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln")).toBe(
      true,
    );
    expect(looksLikeJwt("a-b_c.d-e_f.g-h_i")).toBe(true);
  });

  it("refuses shapes a three-dot check used to accept", () => {
    // Everything accepted here was forwarded to Supabase as a session.
    expect(looksLikeJwt("a.b.c!")).toBe(false);
    expect(looksLikeJwt("has spaces.b.c")).toBe(false);
    expect(looksLikeJwt("a.b.c.d")).toBe(false);
    expect(looksLikeJwt("a..c")).toBe(false);
    expect(looksLikeJwt("totally-invalid-session")).toBe(false);
    // Base64 with `+`/`/` padding is base64, not base64url, so it is not the
    // encoding a JWT uses.
    expect(looksLikeJwt("a+b.c/d.e=")).toBe(false);
  });
});

describe("isMemberToken", () => {
  it("recognizes both prefixes and nothing else", () => {
    expect(isMemberToken("dd_publishable_x")).toBe(true);
    expect(isMemberToken("dd_secret_x")).toBe(true);
    // The `dd_` prefix alone is NOT a member token. `buildUpstreamRequest` used
    // to match on it when rewriting Sec-WebSocket-Protocol, which made a third
    // and looser notion of the same idea.
    expect(isMemberToken("dd_anything")).toBe(false);
    expect(isMemberToken("sb_publishable_x")).toBe(false);
  });
});

describe("apikeyParamNames", () => {
  it("finds the parameter in any case", () => {
    // `URLSearchParams.has` matches byte-for-byte while every header lookup
    // around it is case-insensitive. That asymmetry let `?APIKEY=` skip the
    // realtime rewrite and carry the member token to Supabase in a URL.
    expect(apikeyParamNames(new URLSearchParams("apikey=1"))).toEqual([
      "apikey",
    ]);
    expect(apikeyParamNames(new URLSearchParams("APIKEY=1"))).toEqual([
      "APIKEY",
    ]);
    expect(apikeyParamNames(new URLSearchParams("ApiKey=1&vsn=2"))).toEqual([
      "ApiKey",
    ]);
    expect(apikeyParamNames(new URLSearchParams("vsn=2"))).toEqual([]);
  });
});
