import { buildSecurityHeaders } from "@devdogsuga/headers";
import { describe, expect, it } from "vitest";
import { scheduleBuilderCsp } from "~/config/csp";
import golden from "./securityHeaders.golden.json";

/**
 * `securityHeaders.golden.json` is the header set
 * the retired security-headers package produced for schedule-builder in each environment
 * (with a nonce and Sentry, and with neither). The new build must send the same headers; only the
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
  "schedule-builder security headers (%s)",
  (environment) => {
    const build = (sentryDsn?: string, nonce?: string): Entry[] =>
      buildSecurityHeaders({
        environment,
        csp: scheduleBuilderCsp({
          environment,
          supabaseUrl: urls[environment],
          sentryDsn,
          nonce,
        }),
      });

    it("matches the previous output with a nonce and Sentry", () => {
      expect(
        normalize(build("https://abc@o123.ingest.us.sentry.io/456", "NONCE")),
      ).toEqual(normalize(golden[environment].sentry));
    });

    it("matches the previous output without a nonce or Sentry DSN", () => {
      expect(normalize(build())).toEqual(
        normalize(golden[environment].noSentry),
      );
    });
  },
);
