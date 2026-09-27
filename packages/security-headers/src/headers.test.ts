import { describe, expect, it } from "vitest";
import { applySecurityHeaders, buildSecurityHeaders } from "./headers.js";

const base = {
  supabaseUrl: "https://api.devdogsuga.org",
  sentryDsn: undefined,
  nonce: "test-nonce-value",
} as const;

function get(headers: { key: string; value: string }[], key: string) {
  return headers.find((h) => h.key === key)?.value;
}

describe("buildSecurityHeaders", () => {
  it("omits Strict-Transport-Security in development (plain HTTP)", () => {
    const headers = buildSecurityHeaders({
      ...base,
      environment: "development",
    });
    expect(get(headers, "Strict-Transport-Security")).toBeUndefined();
  });

  it("sets Strict-Transport-Security in staging and production, without preload", () => {
    for (const environment of ["staging", "production"] as const) {
      const headers = buildSecurityHeaders({ ...base, environment });
      const hsts = get(headers, "Strict-Transport-Security");
      expect(hsts).toBe("max-age=31536000; includeSubDomains");
      expect(hsts).not.toContain("preload");
    }
  });

  it("always sets nosniff, referrer, framing, and permissions headers", () => {
    const headers = buildSecurityHeaders({
      ...base,
      environment: "development",
    });

    expect(get(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(get(headers, "Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(get(headers, "X-Frame-Options")).toBe("DENY");
    expect(get(headers, "Permissions-Policy")).toContain("camera=()");
    expect(get(headers, "Permissions-Policy")).toContain("microphone=()");
    expect(get(headers, "Permissions-Policy")).toContain("geolocation=()");
  });

  it("sets Content-Security-Policy-Report-Only, and never the enforcing header", () => {
    const headers = buildSecurityHeaders({
      ...base,
      environment: "production",
    });

    expect(get(headers, "Content-Security-Policy-Report-Only")).toBeTruthy();
    expect(get(headers, "Content-Security-Policy")).toBeUndefined();
  });

  it("threads the Supabase/Sentry/nonce inputs through into the CSP", () => {
    const headers = buildSecurityHeaders({
      environment: "production",
      supabaseUrl: "https://api.devdogsuga.org",
      sentryDsn: "https://key@o1.ingest.sentry.io/1",
      nonce: "abc123",
    });
    const csp = get(headers, "Content-Security-Policy-Report-Only")!;

    expect(csp).toContain("https://api.devdogsuga.org");
    expect(csp).toContain("https://o1.ingest.sentry.io");
    expect(csp).toContain("'nonce-abc123'");
  });

  it("returns a fresh array each call (no shared mutable state between apps)", () => {
    const a = buildSecurityHeaders({ ...base, environment: "production" });
    const b = buildSecurityHeaders({ ...base, environment: "production" });
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("applySecurityHeaders", () => {
  it("sets every built header onto the given Headers instance and returns it", () => {
    const headers = new Headers();
    const result = applySecurityHeaders(headers, {
      ...base,
      environment: "production",
    });

    expect(result).toBe(headers);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(headers.get("Content-Security-Policy-Report-Only")).toBeTruthy();
  });

  it("overwrites a pre-existing same-name header rather than duplicating it", () => {
    const headers = new Headers({ "X-Frame-Options": "SAMEORIGIN" });
    applySecurityHeaders(headers, { ...base, environment: "development" });
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("leaves unrelated headers already on the instance untouched", () => {
    const headers = new Headers({ "Set-Cookie": "sb-session=abc" });
    applySecurityHeaders(headers, { ...base, environment: "development" });
    expect(headers.get("Set-Cookie")).toBe("sb-session=abc");
  });
});
