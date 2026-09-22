import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/core";
import {
  scrubEmails,
  scrubEvent,
  scrubPaths,
  scrubSecrets,
  scrubText,
} from "./scrub.js";

describe("scrubPaths", () => {
  it("reduces a POSIX absolute path to its basename", () => {
    expect(scrubPaths("at /home/sloan/code/DevDogsUGA/src/foo.ts:12:4")).toBe(
      "at foo.ts:12:4",
    );
  });

  it("reduces a Windows absolute path to its basename", () => {
    expect(scrubPaths("C:\\Users\\sloan\\project\\foo.ts")).toBe("foo.ts");
  });

  it("leaves relative-looking text alone", () => {
    expect(scrubPaths("src/foo.ts imported bar")).toBe(
      "src/foo.ts imported bar",
    );
  });
});

describe("scrubEmails", () => {
  it("redacts an email address", () => {
    expect(scrubEmails("contact hello@sloanfinger.com for help")).toBe(
      "contact [redacted-email] for help",
    );
  });

  it("leaves text without an email alone", () => {
    expect(scrubEmails("no email here")).toBe("no email here");
  });
});

describe("scrubSecrets", () => {
  it("redacts an env-var-style secret assignment", () => {
    expect(scrubSecrets("DISCORD_TOKEN=abc123.def456")).toBe(
      "DISCORD_TOKEN=[redacted]",
    );
  });

  it("redacts a bearer token", () => {
    expect(scrubSecrets("Authorization: Bearer sk-abc123XYZ")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });

  it("leaves an ordinary shouty constant alone", () => {
    expect(scrubSecrets("MAX_RETRIES=3")).toBe("MAX_RETRIES=3");
  });
});

it("scrubText composes all three scrubbers", () => {
  expect(
    scrubText(
      "/home/sloan/app/src/foo.ts failed for hello@sloanfinger.com with API_TOKEN=xyz",
    ),
  ).toBe("foo.ts failed for [redacted-email] with API_TOKEN=[redacted]");
});

describe("scrubEvent", () => {
  it("scrubs the top-level message, exception values, and stack frames", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: "failed for hello@sloanfinger.com",
      exception: {
        values: [
          {
            type: "Error",
            value: "boom at /home/sloan/code/app/src/foo.ts",
            stacktrace: {
              frames: [
                {
                  filename: "/home/sloan/code/app/src/foo.ts",
                  abs_path: "/home/sloan/code/app/src/foo.ts",
                  context_line: "throw new Error('DISCORD_TOKEN=abc123')",
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [{ message: "user hello@sloanfinger.com clicked" }],
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.message).toBe("failed for [redacted-email]");
    expect(scrubbed.exception?.values?.[0]?.value).toBe("boom at foo.ts");
    const frame = scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame?.filename).toBe("foo.ts");
    expect(frame?.abs_path).toBe("foo.ts");
    expect(frame?.context_line).toBe(
      "throw new Error('DISCORD_TOKEN=[redacted]')",
    );
    expect(scrubbed.breadcrumbs?.[0]?.message).toBe(
      "user [redacted-email] clicked",
    );
  });

  it("does not throw on an event with no exception or breadcrumbs", () => {
    const event: ErrorEvent = { type: undefined, message: "plain message" };
    expect(() => scrubEvent(event)).not.toThrow();
    expect(scrubEvent(event).message).toBe("plain message");
  });
});
