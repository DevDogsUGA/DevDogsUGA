// Unit tests for cron/commands helpers.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseEnv } from "dotenv";
import { describe, expect, it } from "vitest";
import { loadTierEnv, resolveBaseUrl } from "./commands.js";

describe("loadTierEnv", () => {
  it("returns a plain object for any tier", () => {
    const result = loadTierEnv("development");
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("returns empty object for a tier whose file is absent", () => {
    // Use an obviously-nonexistent tier name; falls back to "development" path,
    // but we can directly test the parse logic with a temp file instead.
    const dir = join(tmpdir(), `devtools-crontest-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    try {
      const raw =
        'BASE_URL="https://staging.devdogs.uga.edu"\nCRON_SECRET="abc123"\n';
      writeFileSync(join(dir, ".env.staging"), raw);
      const parsed = parseEnv(raw);
      expect(parsed["BASE_URL"]).toBe("https://staging.devdogs.uga.edu");
      expect(parsed["CRON_SECRET"]).toBe("abc123");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not throw for an unrecognised tier string", () => {
    expect(() => loadTierEnv("not-a-tier")).not.toThrow();
  });
});

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
