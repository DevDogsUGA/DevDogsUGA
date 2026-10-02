import { buildSecurityHeaders } from "@devdogsuga/headers";
import { describe, expect, it } from "vitest";
import { platformCsp } from "~/lib/csp";
import golden from "./securityHeaders.golden.json";

/**
 * `securityHeaders.golden.json` is the header set
 * the retired security-headers package produced for the platform in each environment
 * (nonce'd and not). The new build must send the same headers; only the
 * order of directives and sources may differ.
 */
type Entry = { key: string; value: string };

function normalize(entries: Entry[]): Record<string, string | string[][]> {
  return Object.fromEntries(
    entries.map(({ key, value }): [string, string | string[][]] =>
      key.startsWith("Content-Security-Policy")
        ? [
            key,
            value
              .split("; ")
              .map((d) => {
                const [name, ...sources] = d.split(" ");
                return [name!, ...sources.sort()].join(" ");
              })
              .sort()
              .map((d) => d.split(" ")),
          ]
        : [key, value],
    ),
  );
}

const urls = {
  development: "http://localhost:54321",
  staging: "https://stg.example.supabase.co",
  production: "https://api.devdogsuga.org",
} as const;

describe.each(["development", "staging", "production"] as const)(
  "platform security headers (%s)",
  (environment) => {
    const build = (nonce?: string): Entry[] =>
      buildSecurityHeaders({
        environment,
        csp: platformCsp({
          environment,
          supabaseUrl: urls[environment],
          sentryDsn: "https://abc@o123.ingest.us.sentry.io/456",
          nonce,
        }),
      });

    it("matches the previous output with a nonce", () => {
      expect(normalize(build("NONCE"))).toEqual(
        normalize(golden[environment].nonce),
      );
    });

    it("matches the previous output without a nonce", () => {
      expect(normalize(build())).toEqual(
        normalize(golden[environment].noNonce),
      );
    });
  },
);
