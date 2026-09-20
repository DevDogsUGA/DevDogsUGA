// Unit tests for cron/commands helpers.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBaseUrl } from "./commands.js";

describe("describeExpr zero-padding (source check)", () => {
  it("source uses padStart for minute component", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname } = await import("node:path");
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "commands.ts"),
      "utf8",
    );
    expect(src).toContain('padStart(2, "0")');
  });
});

describe("resolveBaseUrl", () => {
  it("uses the selected app's development vars instead of assuming port 3000", () => {
    expect(resolveBaseUrl("schedule-builder", "development", {}, {})).toBe(
      "http://localhost:3001",
    );
  });

  it("derives a deployed custom domain from the selected Wrangler tier", () => {
    expect(
      resolveBaseUrl(
        "schedule-builder",
        "production",
        {
          env: {
            production: {
              routes: [{ pattern: "dogdays.dev", custom_domain: true }],
            },
          },
        },
        { BASE_URL: "https://wrong.example" },
      ),
    ).toBe("https://dogdays.dev");
  });
});
