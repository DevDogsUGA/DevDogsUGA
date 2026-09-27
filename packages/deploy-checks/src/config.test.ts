import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "./project-root.js";
import { SMOKE_APPS } from "./config.js";

function pattern(text: string, marker: string): string {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(
      `config.test.ts: could not find "${marker}" in wrangler.jsonc.`,
    );
  }
  const match = /"pattern":\s*"([^"]+)"/.exec(text.slice(markerIndex));
  if (!match?.[1]) {
    throw new Error(
      `config.test.ts: no "pattern" after "${marker}" in wrangler.jsonc.`,
    );
  }
  return match[1];
}

describe("SMOKE_APPS hosts", () => {
  it("match each app's wrangler.jsonc staging/production route pattern", () => {
    for (const config of SMOKE_APPS) {
      const appDir =
        config.app === "platform" ? "apps/platform" : "apps/schedule-builder";
      const text = readFileSync(
        join(PROJECT_ROOT, appDir, "wrangler.jsonc"),
        "utf8",
      );
      const stagingBlock = text.slice(
        text.indexOf('"staging": {'),
        text.indexOf('"production": {'),
      );
      const productionBlock = text.slice(text.indexOf('"production": {'));

      expect(pattern(stagingBlock, '"routes"'), `${config.app} staging`).toBe(
        config.hosts.staging,
      );
      expect(
        pattern(productionBlock, '"routes"'),
        `${config.app} production`,
      ).toBe(config.hosts.production);
    }
  });
});

describe("SMOKE_APPS publicPaths", () => {
  it("platform: every path resolves to a real page.tsx under (site)", () => {
    const platform = SMOKE_APPS.find((c) => c.app === "platform")!;
    for (const path of platform.publicPaths) {
      const segment = path === "/" ? "" : path;
      const file = join(
        PROJECT_ROOT,
        "apps/platform/src/app/(site)",
        segment,
        "page.tsx",
      );
      expect(existsSync(file), file).toBe(true);
    }
  });

  it("schedule-builder: matches src/middleware.ts's PUBLIC_PATHS (minus non-page entries)", () => {
    const scheduleBuilder = SMOKE_APPS.find(
      (c) => c.app === "schedule-builder",
    )!;
    const middlewareText = readFileSync(
      join(PROJECT_ROOT, "apps/schedule-builder/src/middleware.ts"),
      "utf8",
    );
    const start = middlewareText.indexOf("const PUBLIC_PATHS");
    const arrayStart = middlewareText.indexOf("[", start);
    const arrayEnd = middlewareText.indexOf("]", arrayStart);
    const arrayText = middlewareText.slice(arrayStart, arrayEnd + 1);
    const declared = [...arrayText.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

    // Every path this config lists must be declared public in the
    // middleware -- a smoke path the middleware would actually gate is a
    // test bug, not a route problem.
    for (const path of scheduleBuilder.publicPaths) {
      expect(
        declared,
        `${path} missing from middleware PUBLIC_PATHS`,
      ).toContain(path);
    }

    // Every middleware-declared path that has a real page.tsx must be
    // smoke-tested -- the drift this test exists to catch: a page added to
    // PUBLIC_PATHS and forgotten here.
    for (const path of declared) {
      const segment = path === "/" ? "" : path;
      const file = join(
        PROJECT_ROOT,
        "apps/schedule-builder/src/app",
        segment,
        "page.tsx",
      );
      if (existsSync(file)) {
        expect(
          scheduleBuilder.publicPaths,
          `${path} has a page but is missing from publicPaths`,
        ).toContain(path);
      }
    }
  });
});

describe("SMOKE_APPS cronMonitorSlugs", () => {
  it("platform matches apps/platform/cloudflare/scheduled.ts's CRON_ROUTES monitor slugs", () => {
    const platform = SMOKE_APPS.find((c) => c.app === "platform")!;
    const scheduledText = readFileSync(
      join(PROJECT_ROOT, "apps/platform/cloudflare/scheduled.ts"),
      "utf8",
    );
    const slugs = [...scheduledText.matchAll(/monitorSlug:\s*"([^"]+)"/g)].map(
      (m) => m[1]!,
    );
    expect(new Set(platform.cronMonitorSlugs)).toEqual(new Set(slugs));
  });
});
