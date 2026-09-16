// CRON_ROUTES conformance test.
//
// Dynamically imports every apps/*/cloudflare/scheduled.ts that exists and
// zod-validates its CRON_ROUTES export against the contract shape. A missing
// or invalid export fails the test with the file named — the fail-closed
// direction.
//
// Apps without a cloudflare/scheduled.ts (e.g. sandbox) are skipped; their
// absence is expected, not an error.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../environment.js";
import { CronRoutes } from "./schema.js";

const APPS = ["platform", "schedule-builder", "sandbox"];

describe("CRON_ROUTES contract", () => {
  for (const app of APPS) {
    const scheduledPath = join(
      PROJECT_ROOT,
      "apps",
      app,
      "cloudflare",
      "scheduled.ts",
    );

    if (!existsSync(scheduledPath)) continue;

    it(`${app}/cloudflare/scheduled.ts exports a valid CRON_ROUTES`, async () => {
      const mod = await import(pathToFileURL(scheduledPath).href);

      expect(
        mod.CRON_ROUTES,
        `${app}/cloudflare/scheduled.ts must export CRON_ROUTES`,
      ).toBeDefined();

      const result = CronRoutes.safeParse(mod.CRON_ROUTES);
      expect(
        result.success,
        `${app}/cloudflare/scheduled.ts CRON_ROUTES failed validation:\n` +
          (!result.success
            ? result.error.issues
                .map((i) => `  ${i.path.join(".")}: ${i.message}`)
                .join("\n")
            : ""),
      ).toBe(true);

      if (result.success) {
        for (const [expr, entry] of Object.entries(result.data)) {
          expect(
            entry.routes.length,
            `${app}: expression "${expr}" must have at least one route`,
          ).toBeGreaterThan(0);
          expect(
            entry.label.trim().length,
            `${app}: expression "${expr}" must have a non-blank label`,
          ).toBeGreaterThan(0);
        }
      }
    });
  }
});
