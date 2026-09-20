// Unit tests for cron/commands helpers.
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * `runCronRun`'s own dependencies, faked at the module boundary for the
 * `MissingEnvFileError` test near the bottom of this file: `discoverCronMaps`
 * and `discoverWranglerConfigs` so the picker sees one controlled route cron
 * instead of walking `apps/*` on disk, and `@devdogsuga/env/load` so the
 * tier's env load fails the way a missing `.env.staging` would without an
 * actual missing file. Every other test in this file exercises a pure helper
 * directly (`resolveBaseUrl`, the source check below) and needs none of this.
 */
const fixtures = vi.hoisted(() => ({
  maps: [
    {
      app: "schedule-builder",
      path: "/repo/apps/schedule-builder/cloudflare/scheduled.ts",
      routes: {
        "0 0 * * *": { label: "daily sync", routes: ["/api/cron/daily"] },
      },
      workflows: {},
    },
  ],
  configs: [
    {
      app: "schedule-builder",
      path: "/repo/apps/schedule-builder/wrangler.jsonc",
      config: {
        env: {
          staging: { triggers: { crons: ["0 0 * * *"] } },
        },
      },
    },
  ],
}));

vi.mock("./discovery.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./discovery.js")>()),
  discoverCronMaps: vi.fn(async () => fixtures.maps),
  discoverWranglerConfigs: vi.fn(() => fixtures.configs),
}));

vi.mock("@devdogsuga/env/load", () => {
  class MissingEnvFileError extends Error {}
  return {
    loadEnvironment: vi.fn(async () => {
      throw new MissingEnvFileError(
        ".env.staging does not exist. Run `pnpm devtools env pull --target staging` to fetch it.",
      );
    }),
    MissingEnvFileError,
  };
});

const { resolveBaseUrl, runCronRun } = await import("./commands.js");

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

/**
 * `runCronRun`'s catch around `loadEnvironment`: a missing tier env file must
 * read as "run `env pull`", not as an unhandled rejection or a raw
 * ECONNREFUSED from the fetch further down that a caller would never reach.
 * `--cron` and `--yes` are both passed so the run gets past the picker and
 * the deployed-tier confirm without a terminal, and lands on the load.
 */
describe("runCronRun MissingEnvFileError", () => {
  it("reports the missing env file on stderr and returns 1 without firing anything", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const code = await runCronRun([
      "--tier",
      "staging",
      "--cron",
      "0 0 * * *",
      "--yes",
    ]);

    expect(code).toBe(1);
    const lines = stderr.mock.calls.map(([chunk]) => String(chunk));
    expect(lines.some((line) => line.startsWith("devtools cron run:"))).toBe(
      true,
    );

    stderr.mockRestore();
  });
});
