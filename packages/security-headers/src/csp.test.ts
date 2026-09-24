import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./csp.js";

describe("buildContentSecurityPolicy", () => {
  it("includes the Supabase origin (not the full URL) in connect-src and img-src", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl: "https://api.devdogsuga.org/some/path?query=1",
    });

    expect(csp).toContain("connect-src 'self' https://api.devdogsuga.org");
    expect(csp).toContain("https://api.devdogsuga.org");
    // Only the origin, not the path/query -- CSP source expressions don't
    // support paths meaningfully for fetch destinations.
    expect(csp).not.toContain("/some/path");
  });

  it("derives a different connect-src per environment's Supabase URL", () => {
    const prod = buildContentSecurityPolicy({
      supabaseUrl: "https://api.devdogsuga.org",
    });
    const local = buildContentSecurityPolicy({
      supabaseUrl: "http://127.0.0.1:54321",
    });

    expect(prod).toContain("https://api.devdogsuga.org");
    expect(local).toContain("http://127.0.0.1:54321");
    expect(local).not.toContain("api.devdogsuga.org");
  });

  it("omits a Sentry ingest origin when no DSN is configured", () => {
    for (const dsn of [undefined, null, ""] as const) {
      const csp = buildContentSecurityPolicy({
        supabaseUrl: "https://api.devdogsuga.org",
        sentryDsn: dsn,
      });
      expect(csp).not.toMatch(/ingest\.sentry\.io/);
    }
  });

  it("includes the Sentry ingest origin (not the full DSN, which carries the public key) when configured", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl: "https://api.devdogsuga.org",
      sentryDsn: "https://examplekey@o123.ingest.us.sentry.io/456",
    });

    expect(csp).toContain("https://o123.ingest.us.sentry.io");
    expect(csp).not.toContain("examplekey");
    expect(csp).not.toContain("/456");
  });

  it("allowlists GitHub avatars in img-src unconditionally", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl: "https://api.devdogsuga.org",
    });
    expect(csp).toMatch(
      /img-src[^;]*https:\/\/avatars\.githubusercontent\.com/,
    );
  });

  it("does not allowlist any Google/Discord/LinkedIn avatar host", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl: "https://api.devdogsuga.org",
    });
    expect(csp).not.toMatch(/googleusercontent|discordapp|licdn\.com/);
  });

  it("denies framing and object embeds", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl: "https://api.devdogsuga.org",
    });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("falls back to just 'self' when the Supabase URL is unparseable", () => {
    const csp = buildContentSecurityPolicy({ supabaseUrl: "not-a-url" });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("connect-src 'self' 'self'");
  });

  it("is stable/deterministic for the same input", () => {
    const input = {
      supabaseUrl: "https://api.devdogsuga.org",
      sentryDsn: "https://key@o1.ingest.sentry.io/1",
    };
    expect(buildContentSecurityPolicy(input)).toBe(
      buildContentSecurityPolicy(input),
    );
  });
});
