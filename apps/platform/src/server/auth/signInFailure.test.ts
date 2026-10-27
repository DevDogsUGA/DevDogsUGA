import { describe, expect, it } from "vitest";
import {
  failureFromProviderError,
  INCIDENT_REF_PATTERN,
  newIncidentRef,
  parseFailureQuery,
  retryUrl,
  signInFailureUrl,
} from "./signInFailure";

describe("failureFromProviderError", () => {
  it("reads a declined consent as a cancellation", () => {
    expect(failureFromProviderError("access_denied", null)).toBe("cancelled");
    expect(failureFromProviderError(null, "access_denied")).toBe("cancelled");
    expect(failureFromProviderError("server_error", "user_cancelled")).toBe(
      "cancelled",
    );
  });

  it("treats every other provider error as unexpected", () => {
    expect(failureFromProviderError("server_error", "unexpected_failure")).toBe(
      "unexpected",
    );
    expect(failureFromProviderError(null, null)).toBe("unexpected");
  });
});

describe("newIncidentRef", () => {
  it("makes distinct references that match the shown format", () => {
    const refs = new Set(Array.from({ length: 50 }, newIncidentRef));
    expect(refs.size).toBe(50);
    for (const ref of refs) expect(ref).toMatch(INCIDENT_REF_PATTERN);
  });
});

describe("signInFailureUrl", () => {
  it("carries the validated destination, and a reference only when unexpected", () => {
    expect(
      signInFailureUrl("cancelled", "/attendance/complete", "SI-AAAAAAAA"),
    ).toBe("/auth/failed?reason=cancelled&returnTo=%2Fattendance%2Fcomplete");
    expect(
      signInFailureUrl("unexpected", "/settings", "SI-0123456789".slice(0, 11)),
    ).toBe(
      "/auth/failed?reason=unexpected&returnTo=%2Fsettings&ref=SI-01234567",
    );
  });

  it("drops an unsafe destination", () => {
    expect(signInFailureUrl("wrong_account", "//evil.example")).toBe(
      "/auth/failed?reason=wrong_account",
    );
  });
});

describe("retryUrl", () => {
  it("goes back through /auth toward the destination", () => {
    expect(retryUrl("/attendance/complete")).toBe(
      "/auth?callbackPath=%2Fattendance%2Fcomplete",
    );
    expect(retryUrl("/")).toBe("/auth");
    expect(retryUrl("https://evil.example")).toBe("/auth");
  });
});

describe("parseFailureQuery", () => {
  it("accepts a well-formed query", () => {
    expect(
      parseFailureQuery({
        reason: "unexpected",
        returnTo: "/attendance/complete",
        ref: "SI-ABCDEFGH",
      }),
    ).toEqual({
      failure: "unexpected",
      returnTo: "/attendance/complete",
      ref: "SI-ABCDEFGH",
    });
  });

  it("degrades anything hostile or malformed", () => {
    expect(
      parseFailureQuery({
        reason: "<script>",
        returnTo: "//evil.example",
        ref: "<img src=x>",
      }),
    ).toEqual({ failure: "unexpected", returnTo: "/", ref: null });
  });

  it("shows no reference for the expected failures", () => {
    expect(
      parseFailureQuery({ reason: "wrong_account", ref: "SI-ABCDEFGH" }).ref,
    ).toBeNull();
    expect(parseFailureQuery({ reason: ["cancelled"] }).failure).toBe(
      "unexpected",
    );
  });
});
