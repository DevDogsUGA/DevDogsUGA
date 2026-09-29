import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, type CspInput } from "./csp.js";

const base = {
  supabaseUrl: "https://api.devdogsuga.org",
  nonce: "test-nonce-value",
  environment: "production",
} satisfies CspInput;

describe("buildContentSecurityPolicy", () => {
  it("includes the Supabase origin (not the full URL) in connect-src and img-src", () => {
    const csp = buildContentSecurityPolicy({
      ...base,
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
      ...base,
      supabaseUrl: "https://api.devdogsuga.org",
    });
    const local = buildContentSecurityPolicy({
      ...base,
      supabaseUrl: "http://127.0.0.1:54321",
    });

    expect(prod).toContain("https://api.devdogsuga.org");
    expect(local).toContain("http://127.0.0.1:54321");
    expect(local).not.toContain("api.devdogsuga.org");
  });

  it("omits a Sentry ingest origin when no DSN is configured", () => {
    for (const dsn of [undefined, null, ""] as const) {
      const csp = buildContentSecurityPolicy({
        ...base,
        sentryDsn: dsn,
      });
      expect(csp).not.toMatch(/ingest\.sentry\.io/);
    }
  });

  it("includes the Sentry ingest origin (not the full DSN, which carries the public key) when configured", () => {
    const csp = buildContentSecurityPolicy({
      ...base,
      sentryDsn: "https://examplekey@o123.ingest.us.sentry.io/456",
    });

    expect(csp).toContain("https://o123.ingest.us.sentry.io");
    expect(csp).not.toContain("examplekey");
    expect(csp).not.toContain("/456");
  });

  it("allowlists GitHub avatars in img-src unconditionally", () => {
    const csp = buildContentSecurityPolicy(base);
    expect(csp).toMatch(
      /img-src[^;]*https:\/\/avatars\.githubusercontent\.com/,
    );
  });

  it("does not allowlist any Google/Discord/LinkedIn avatar host", () => {
    const csp = buildContentSecurityPolicy(base);
    expect(csp).not.toMatch(/googleusercontent|discordapp|licdn\.com/);
  });

  it("appends extraSources to img-src and adds media-src/frame-src only when given", () => {
    const csp = buildContentSecurityPolicy({
      ...base,
      extraSources: {
        img: ["https://cdn.discordapp.com"],
        media: ["https://cdn.discordapp.com"],
        frame: ["https://challenges.cloudflare.com"],
      },
    });
    expect(csp).toMatch(/img-src [^;]*https:\/\/cdn\.discordapp\.com/);
    expect(csp).toContain("media-src 'self' https://cdn.discordapp.com");
    expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com");

    const plain = buildContentSecurityPolicy(base);
    expect(plain).not.toContain("media-src");
    expect(plain).not.toContain("frame-src");
  });

  it("denies framing and object embeds", () => {
    const csp = buildContentSecurityPolicy(base);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("falls back to just 'self' when the Supabase URL is unparseable", () => {
    const csp = buildContentSecurityPolicy({
      ...base,
      supabaseUrl: "not-a-url",
    });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("connect-src 'self' 'self'");
  });

  it("is stable/deterministic for the same input", () => {
    const input = {
      ...base,
      sentryDsn: "https://key@o1.ingest.sentry.io/1",
    };
    expect(buildContentSecurityPolicy(input)).toBe(
      buildContentSecurityPolicy(input),
    );
  });

  describe("script-src", () => {
    it("carries the given nonce and 'strict-dynamic', never 'unsafe-inline'", () => {
      const csp = buildContentSecurityPolicy({ ...base, nonce: "abc123" });
      expect(csp).toMatch(/script-src[^;]*'nonce-abc123'/);
      expect(csp).toMatch(/script-src[^;]*'strict-dynamic'/);
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    });

    it("keeps 'self' as a fallback for browsers that ignore 'strict-dynamic'", () => {
      const csp = buildContentSecurityPolicy(base);
      expect(csp).toMatch(/script-src[^;]*'self'/);
    });

    it("adds 'unsafe-eval' only in development, for Vite/React Fast Refresh", () => {
      const dev = buildContentSecurityPolicy({
        ...base,
        environment: "development",
      });
      const staging = buildContentSecurityPolicy({
        ...base,
        environment: "staging",
      });
      const prod = buildContentSecurityPolicy({
        ...base,
        environment: "production",
      });

      expect(dev).toMatch(/script-src[^;]*'unsafe-eval'/);
      expect(staging).not.toMatch(/script-src[^;]*'unsafe-eval'/);
      expect(prod).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    });

    it("appends extraScriptSources (e.g. a content hash) verbatim", () => {
      const csp = buildContentSecurityPolicy({
        ...base,
        extraScriptSources: ["'sha256-abcDEF123=='"],
      });
      expect(csp).toMatch(/script-src[^;]*'sha256-abcDEF123=='/);
    });

    it("omits extraScriptSources entirely when not given", () => {
      const withExtra = buildContentSecurityPolicy({
        ...base,
        extraScriptSources: ["'sha256-xyz'"],
      });
      const without = buildContentSecurityPolicy(base);
      expect(without).not.toContain("sha256-xyz");
      expect(withExtra).not.toBe(without);
    });
  });

  it("keeps style-src 'unsafe-inline' (no nonce/hash wiring for style yet)", () => {
    const csp = buildContentSecurityPolicy(base);
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
  });
});
