import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `workers.json`'s `smoke` field is what `backstage deploy smoke` reads, so
 * nothing at deploy time notices it going stale. These assertions are the
 * alarm: the hosts have to be the ones `wrangler.jsonc` routes, and the
 * public paths have to be the middleware's own allowlist (the ones with a
 * real page).
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
    typeof candidate !== "string" && candidate.path === "apps/schedule-builder",
);
const smoke = typeof entry === "object" ? entry.smoke : undefined;

function routePattern(wrangler: string, tier: string): string {
  const block = wrangler.slice(wrangler.indexOf(`"${tier}": {`));
  const match = /"pattern":\s*"([^"]+)"/.exec(block);
  if (!match?.[1]) throw new Error(`no route pattern under "${tier}"`);
  return match[1];
}

/** `src/middleware.ts`'s PUBLIC_PATHS, read as text: the array is not exported. */
function middlewarePublicPaths(): string[] {
  const text = readFileSync(join(appDir, "src/middleware.ts"), "utf8");
  const start = text.indexOf("[", text.indexOf("const PUBLIC_PATHS"));
  const end = text.indexOf("]", start);
  return [...text.slice(start, end + 1).matchAll(/"([^"]+)"/g)].map(
    (match) => match[1]!,
  );
}

const hasPage = (path: string): boolean =>
  existsSync(join(appDir, "src/app", path === "/" ? "" : path, "page.tsx"));

describe("workers.json smoke data for schedule-builder", () => {
  it("exists", () => {
    expect(smoke).toBeDefined();
  });

  it("names the hosts wrangler.jsonc routes", () => {
    const wrangler = readFileSync(join(appDir, "wrangler.jsonc"), "utf8");
    expect(smoke?.hosts.staging).toBe(routePattern(wrangler, "staging"));
    expect(smoke?.hosts.production).toBe(routePattern(wrangler, "production"));
  });

  it("lists only paths the middleware leaves public", () => {
    const declared = middlewarePublicPaths();
    for (const path of smoke?.publicPaths ?? []) {
      expect(declared, path).toContain(path);
    }
  });

  it("misses no public path that has a page", () => {
    for (const path of middlewarePublicPaths().filter(hasPage)) {
      expect(smoke?.publicPaths, path).toContain(path);
    }
  });
});
