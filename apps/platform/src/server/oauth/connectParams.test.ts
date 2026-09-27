import { describe, expect, it } from "vitest";
import { parseConnectParams } from "./connectParams";

const VALID_CHALLENGE = "a".repeat(43);

function validParams(overrides: Record<string, string> = {}) {
  return {
    redirect_uri: "http://127.0.0.1:51820/callback",
    code_challenge: VALID_CHALLENGE,
    code_challenge_method: "S256",
    state: "opaque-state",
    label: "my-project",
    callback_uri: "https://project.supabase.co/auth/v1/callback",
    ...overrides,
  };
}

describe("parseConnectParams", () => {
  it("accepts a fully valid query string", () => {
    const result = parseConnectParams(validParams());
    expect(result.ok).toBe(true);
  });

  it("accepts localhost as well as 127.0.0.1", () => {
    const result = parseConnectParams(
      validParams({ redirect_uri: "http://localhost:4000/cb" }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a non-loopback redirect_uri", () => {
    const result = parseConnectParams(
      validParams({ redirect_uri: "http://example.com/callback" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/loopback/i);
  });

  it("rejects an https redirect_uri even on a loopback host", () => {
    const result = parseConnectParams(
      validParams({ redirect_uri: "https://127.0.0.1:51820/callback" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a redirect_uri that isn't a URL at all", () => {
    const result = parseConnectParams(
      validParams({ redirect_uri: "not-a-url" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a code_challenge_method other than S256", () => {
    const result = parseConnectParams(
      validParams({ code_challenge_method: "plain" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed code_challenge", () => {
    const result = parseConnectParams(validParams({ code_challenge: "!!!" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a missing state", () => {
    const result = parseConnectParams(validParams({ state: "" }));
    expect(result.ok).toBe(false);
  });

  it("rejects an empty label", () => {
    const result = parseConnectParams(validParams({ label: "   " }));
    expect(result.ok).toBe(false);
  });

  it("rejects a label over 100 characters", () => {
    const result = parseConnectParams(validParams({ label: "x".repeat(101) }));
    expect(result.ok).toBe(false);
  });

  it("trims the label", () => {
    const result = parseConnectParams(validParams({ label: "  my-project  " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.label).toBe("my-project");
  });

  it("rejects a callback_uri that isn't absolute", () => {
    const result = parseConnectParams(
      validParams({ callback_uri: "/auth/v1/callback" }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts an http callback_uri (local Supabase)", () => {
    const result = parseConnectParams(
      validParams({ callback_uri: "http://127.0.0.1:54321/auth/v1/callback" }),
    );
    expect(result.ok).toBe(true);
  });
});
