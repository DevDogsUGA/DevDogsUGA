import { describe, expect, it } from "vitest";
import { parseRegistrationParams } from "./registrationParams";

function validParams(
  overrides: Partial<{ label: string; callbackUri: string }> = {},
) {
  return {
    label: "my-project",
    callbackUri: "https://project.supabase.co/auth/v1/callback",
    ...overrides,
  };
}

describe("parseRegistrationParams", () => {
  it("accepts a valid label and callback_uri", () => {
    const result = parseRegistrationParams(validParams());
    expect(result.ok).toBe(true);
  });

  it("rejects an empty label", () => {
    const result = parseRegistrationParams(validParams({ label: "   " }));
    expect(result.ok).toBe(false);
  });

  it("rejects a label over 100 characters", () => {
    const result = parseRegistrationParams(
      validParams({ label: "x".repeat(101) }),
    );
    expect(result.ok).toBe(false);
  });

  it("trims the label", () => {
    const result = parseRegistrationParams(
      validParams({ label: "  my-project  " }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.params.label).toBe("my-project");
  });

  it("rejects a callback_uri that isn't absolute", () => {
    const result = parseRegistrationParams(
      validParams({ callbackUri: "/auth/v1/callback" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a callback_uri that isn't a URL at all", () => {
    const result = parseRegistrationParams(
      validParams({ callbackUri: "not-a-url" }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts an http callback_uri (local Supabase)", () => {
    const result = parseRegistrationParams(
      validParams({ callbackUri: "http://127.0.0.1:54321/auth/v1/callback" }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a non-http(s) scheme", () => {
    const result = parseRegistrationParams(
      validParams({ callbackUri: "ftp://example.com/callback" }),
    );
    expect(result.ok).toBe(false);
  });
});
