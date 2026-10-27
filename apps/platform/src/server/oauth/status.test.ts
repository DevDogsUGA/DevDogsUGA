import { describe, expect, it } from "vitest";
import { decideConsent, maySkipConsent, parseStatus } from "./status";

const REDIRECT = "https://dogdays.supabase.co/auth/v1/callback";
const OWNER = "owner";
const OTHER = "other";

function decide(overrides: Partial<Parameters<typeof decideConsent>[0]> = {}) {
  return decideConsent({
    status: "in_production",
    asksForConsent: true,
    redirectUri: REDIRECT,
    ownerUserId: OWNER,
    userId: OTHER,
    isTestIdentity: false,
    ...overrides,
  });
}

describe("parseStatus", () => {
  it("accepts the two statuses and nothing else", () => {
    expect(parseStatus("testing")).toBe("testing");
    expect(parseStatus("in_production")).toBe("in_production");
    expect(parseStatus("production")).toBeNull();
    expect(parseStatus("Testing")).toBeNull();
    expect(parseStatus(null)).toBeNull();
  });
});

describe("maySkipConsent", () => {
  it("is true only for an ownerless app that is In production", () => {
    expect(maySkipConsent({ ownerUserId: null, status: "in_production" })).toBe(
      true,
    );
    expect(maySkipConsent({ ownerUserId: null, status: "testing" })).toBe(
      false,
    );
    expect(
      maySkipConsent({ ownerUserId: OWNER, status: "in_production" }),
    ).toBe(false);
  });
});

describe("decideConsent", () => {
  it("shows the owner of a Testing app the account picker, and nobody else", () => {
    expect(decide({ status: "testing", userId: OWNER })).toBe("pick-account");
    expect(decide({ status: "testing", userId: OTHER })).toBe("not-found");
  });

  it("gives a DevDogs app in Testing to nobody", () => {
    expect(
      decide({ status: "testing", ownerUserId: null, userId: OTHER }),
    ).toBe("not-found");
  });

  it("asks every member of an In production member app, the owner included", () => {
    expect(decide()).toBe("consent");
    expect(decide({ userId: OWNER })).toBe("consent");
  });

  it("approves a DevDogs app that skips consent, and shows one that asks", () => {
    expect(decide({ ownerUserId: null, asksForConsent: false })).toBe(
      "auto-approve",
    );
    expect(decide({ ownerUserId: null, asksForConsent: true })).toBe("consent");
  });

  it("never skips consent for a member's app, even if the flag says so", () => {
    expect(decide({ asksForConsent: false })).toBe("consent");
  });

  it("refuses test identities on an In production app (Q164)", () => {
    expect(decide({ isTestIdentity: true })).toBe("test-identity");
    expect(
      decide({
        ownerUserId: null,
        asksForConsent: false,
        isTestIdentity: true,
      }),
    ).toBe("test-identity");
  });

  it("is a 404 for an unknown status or a return address the redirect rule refuses", () => {
    expect(decide({ status: null })).toBe("not-found");
    expect(decide({ redirectUri: null })).toBe("not-found");
    expect(decide({ redirectUri: "http://example.com/cb" })).toBe("not-found");
    expect(
      decide({ status: "testing", userId: OWNER, redirectUri: "myapp://cb" }),
    ).toBe("not-found");
  });

  it("accepts a local http return address", () => {
    expect(
      decide({
        status: "testing",
        userId: OWNER,
        redirectUri: "http://127.0.0.1:54321/auth/v1/callback",
      }),
    ).toBe("pick-account");
  });
});
