import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `preview.ts` is the entry the platform's Worker bundles. Shiki's Oniguruma
 * engine compiles WebAssembly at run time, which Workers forbid, and the file
 * system isn't there to read, so nothing reachable from it may import either.
 * This walks the value imports from the entry (type-only imports are erased and
 * don't count) and fails on the first path that reaches a forbidden module.
 */

const SRC = __dirname;
const FORBIDDEN_PACKAGES =
  /^(shiki|@shikijs\/.*|node:fs|fs|node:os|os|node:child_process|node:worker_threads)(\/|$)/;
const FORBIDDEN_FILES = new Set([
  "render.ts",
  "compile.ts",
  "untrusted.ts",
  "readiness-dir.ts",
  "index.ts",
  "cli.ts",
  "check.ts",
  "candidate.ts",
  "build-cache.ts",
  "search-index.ts",
  "write.ts",
  "workspace.ts",
]);

function valueImports(file: string): string[] {
  const source = fs.readFileSync(path.join(SRC, file), "utf8");
  const found: string[] = [];
  const patterns = [
    /^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gms,
    /^import\s+["']([^"']+)["']/gm,
    /^export\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gms,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]!);
  }
  return found;
}

/** Every module the entry reaches, with the first chain that reached it. */
function reach(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const spec of valueImports(file)) {
      const chain = [...seen.get(file)!, spec];
      if (spec.startsWith(".")) {
        const next = spec.replace(/^\.\//, "").replace(/\.js$/, ".ts");
        if (!seen.has(next)) {
          seen.set(next, chain);
          queue.push(next);
        }
      } else if (!seen.has(spec)) {
        seen.set(spec, chain);
      }
    }
  }
  return seen;
}

describe("the Worker entry (preview.ts)", () => {
  const reached = reach("preview.ts");

  it("reaches no highlighter and no file system", () => {
    const bad = [...reached]
      .filter(
        ([name]) => FORBIDDEN_PACKAGES.test(name) || FORBIDDEN_FILES.has(name),
      )
      .map(([name, chain]) => `${name} via ${chain.join(" -> ")}`);
    expect(bad).toEqual([]);
  });

  it("does reach the shared rules, so this test is looking at the right graph", () => {
    for (const file of [
      "untrusted-policy.ts",
      "readiness.ts",
      "render-plain.ts",
      "plain-code.ts",
      "compile-core.ts",
      "render-pipeline.ts",
    ]) {
      expect(reached.has(file), file).toBe(true);
    }
  });

  it("is the only thing the package exports for the Worker", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(SRC, "..", "package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(manifest.exports)).toEqual([".", "./preview"]);
  });
});
