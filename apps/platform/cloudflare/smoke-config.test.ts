import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `workers.json`'s `smoke` field is what `backstage deploy smoke` reads, so
 * nothing at deploy time notices it going stale. These assertions are the
 * alarm: the hosts have to be the ones `wrangler.jsonc` routes, and every
 * public path has to be a real page.
 */
const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(appDir, "..", "..");

interface Smoke {
  hosts: { staging: string; production: string };
  publicPaths: string[];
}

const entry = (
  JSON.parse(readFileSync(join(root, "workers.json"), "utf8")) as (
    string | { path: string; smoke?: Smoke }
  )[]
).find(
  (candidate) =>
    typeof candidate !== "string" && candidate.path === "apps/platform",
);
const smoke = typeof entry === "object" ? entry.smoke : undefined;

function routePattern(wrangler: string, tier: string): string {
  const block = wrangler.slice(wrangler.indexOf(`"${tier}": {`));
  const match = /"pattern":\s*"([^"]+)"/.exec(block);
  if (!match?.[1]) throw new Error(`no route pattern under "${tier}"`);
  return match[1];
}

describe("workers.json smoke data for platform", () => {
  it("exists", () => {
    expect(smoke).toBeDefined();
  });

  it("names the hosts wrangler.jsonc routes", () => {
    const wrangler = readFileSync(join(appDir, "wrangler.jsonc"), "utf8");
    expect(smoke?.hosts.staging).toBe(routePattern(wrangler, "staging"));
    expect(smoke?.hosts.production).toBe(routePattern(wrangler, "production"));
  });

  it("lists only paths that resolve to a real page under (site)", () => {
    for (const path of smoke?.publicPaths ?? []) {
      const file = join(
        appDir,
        "src/app/(site)",
        path === "/" ? "" : path,
        "page.tsx",
      );
      expect(existsSync(file), file).toBe(true);
    }
  });
});
