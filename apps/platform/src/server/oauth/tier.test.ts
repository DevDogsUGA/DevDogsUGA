import { describe, expect, it } from "vitest";
import {
  decideConsent,
  isSupabaseReturnAddress,
  parseTier,
  productionRedirectUriError,
} from "./tier";

describe("parseTier", () => {
  it("accepts the two tiers and nothing else", () => {
    expect(parseTier("development")).toBe("development");
    expect(parseTier("production")).toBe("production");
    expect(parseTier("Production")).toBeNull();
    expect(parseTier("")).toBeNull();
    expect(parseTier(null)).toBeNull();
    expect(parseTier(undefined)).toBeNull();
  });
});

describe("isSupabaseReturnAddress", () => {
  it.each([
    "https://dogdays.supabase.co/auth/v1/callback",
    "https://dogpack.supabase.co/auth/v1/callback",
    "https://fqpbnmwyopohbhzkpoiu.supabase.co/auth/v1/callback",
    "https://a.supabase.co/auth/v1/callback",
  ])("accepts %s", (uri) => {
    expect(isSupabaseReturnAddress(uri)).toBe(true);
  });

  it.each([
    ["plain http", "http://dogdays.supabase.co/auth/v1/callback"],
    ["a local stack", "http://127.0.0.1:54321/auth/v1/callback"],
    ["localhost", "http://localhost:3000/auth"],
    ["another host", "https://example.com/auth/v1/callback"],
    ["a custom domain", "https://api.devdogsuga.org/auth/v1/callback"],
    [
      "a lookalike suffix",
      "https://dogdays.supabase.co.evil.test/auth/v1/callback",
    ],
    ["a lookalike prefix", "https://supabase.co.evil.test/auth/v1/callback"],
    ["a nested subdomain", "https://x.dogdays.supabase.co/auth/v1/callback"],
    ["the bare apex", "https://supabase.co/auth/v1/callback"],
    ["a different path", "https://dogdays.supabase.co/auth"],
    ["a trailing slash", "https://dogdays.supabase.co/auth/v1/callback/"],
    ["a query string", "https://dogdays.supabase.co/auth/v1/callback?x=1"],
    ["a fragment", "https://dogdays.supabase.co/auth/v1/callback#x"],
    ["credentials", "https://user:pw@dogdays.supabase.co/auth/v1/callback"],
    ["a port", "https://dogdays.supabase.co:8443/auth/v1/callback"],
    [
      "a plus sign in the host",
      "https://dogdays.supabase.co+/auth/v1/callback",
    ],
    [
      "a backslash trick",
      "https://evil.test\\@dogdays.supabase.co/auth/v1/callback",
    ],
    ["no scheme", "dogdays.supabase.co/auth/v1/callback"],
    ["an empty string", ""],
  ])("rejects %s", (_label, uri) => {
    expect(isSupabaseReturnAddress(uri)).toBe(false);
  });
});

describe("productionRedirectUriError", () => {
  it("is null for a qualifying address and a message otherwise", () => {
    expect(
      productionRedirectUriError(
        "https://dogdays.supabase.co/auth/v1/callback",
      ),
    ).toBeNull();
    expect(productionRedirectUriError("http://localhost:3000/auth")).toMatch(
      /supabase\.co\/auth\/v1\/callback/,
    );
  });
});

describe("decideConsent", () => {
  const owner = "00000000-0000-4000-8000-000000000001";
  const stranger = "00000000-0000-4000-8000-000000000002";
  const supabase = "https://dogdays.supabase.co/auth/v1/callback";

  it("approves a production client for anyone, even a non-owner", () => {
    expect(
      decideConsent({
        tier: "production",
        redirectUri: supabase,
        ownerUserId: owner,
        userId: stranger,
      }),
    ).toBe("auto-approve");
    expect(
      decideConsent({
        tier: "production",
        redirectUri: supabase,
        ownerUserId: owner,
        userId: owner,
      }),
    ).toBe("auto-approve");
  });

  it("approves an ownerless production client (a DevDogs app) for anyone", () => {
    expect(
      decideConsent({
        tier: "production",
        redirectUri: supabase,
        ownerUserId: null,
        userId: stranger,
      }),
    ).toBe("auto-approve");
  });

  it("404s a production client whose return address is not a Supabase callback", () => {
    for (const redirectUri of [
      "http://localhost:3000/auth",
      "https://example.com/cb",
      null,
    ]) {
      expect(
        decideConsent({
          tier: "production",
          redirectUri,
          ownerUserId: owner,
          userId: owner,
        }),
      ).toBe("not-found");
    }
  });

  it("shows a development client's form to its owner only", () => {
    expect(
      decideConsent({
        tier: "development",
        redirectUri: "http://127.0.0.1:54321/auth/v1/callback",
        ownerUserId: owner,
        userId: owner,
      }),
    ).toBe("owner-form");
    expect(
      decideConsent({
        tier: "development",
        redirectUri: "http://127.0.0.1:54321/auth/v1/callback",
        ownerUserId: owner,
        userId: stranger,
      }),
    ).toBe("not-found");
  });

  it("does not approve a development client just because its return address looks like Supabase", () => {
    expect(
      decideConsent({
        tier: "development",
        redirectUri: supabase,
        ownerUserId: owner,
        userId: stranger,
      }),
    ).toBe("not-found");
  });

  it("404s an unknown tier", () => {
    expect(
      decideConsent({
        tier: null,
        redirectUri: supabase,
        ownerUserId: owner,
        userId: owner,
      }),
    ).toBe("not-found");
  });
});
