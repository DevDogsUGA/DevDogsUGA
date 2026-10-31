// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Scheduled docs are gone: a page is public the day it merges. This walks the
 * docs compiler and the platform's source for anything that still reads the
 * old `scheduled:` front matter, its `publishAt` time, or the preview of
 * upcoming pages, so a stray reader fails here rather than silently doing
 * nothing. The one place the word survives on purpose is the compiler's
 * refusal of the key (and its test), so a page that still sets it fails the
 * build instead of publishing at once.
 */

const ROOT = resolve(__dirname, "../../../../..");
const SOURCES = ["packages/docs-kit/src", "apps/platform/src"].map((dir) =>
  join(ROOT, dir),
);

/** Names that only the old schedule used. */
const READERS =
  /\b(publishAt|DocsScheduled|getDocsUpcoming|readScheduled|applySchedules|docsPathExists|visibleView)\b|frontmatter\[["']scheduled["']\]/;

/** `publishAt` still names a database column the next migration drops. */
const ALLOWED = new Set([
  "apps/platform/src/server/db/schema/generated/schema.ts",
  "apps/platform/src/server/docs/noScheduledDocs.test.ts",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next") return [];
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx|css|md)$/.test(name) ? [path] : [];
  });
}

describe("scheduled docs", () => {
  it("have no reader left in the docs compiler or the platform", () => {
    const offenders = SOURCES.flatMap(files).flatMap((path) => {
      const rel = relative(ROOT, path);
      if (ALLOWED.has(rel)) return [];
      return readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          READERS.test(line) ? [`${rel}:${i + 1}: ${line.trim()}`] : [],
        );
    });
    expect(offenders).toEqual([]);
  });

  it("keep only the compiler's refusal of the old key, and the tests of it", () => {
    const hits = SOURCES.flatMap(files).flatMap((path) => {
      const rel = relative(ROOT, path);
      if (ALLOWED.has(rel)) return [];
      return readFileSync(path, "utf8").includes("scheduled:") &&
        rel.startsWith("packages/docs-kit/src")
        ? [rel]
        : [];
    });
    expect(hits.sort()).toEqual([
      "packages/docs-kit/src/compile.test.ts",
      "packages/docs-kit/src/readiness.test.ts",
    ]);
  });

  it("is not set by any page in docs/", () => {
    const pages = files(join(ROOT, "docs")).filter((path) =>
      path.endsWith(".md"),
    );
    const setting = pages.filter((path) =>
      /^---\n(?:(?!---\n)[\s\S])*?^scheduled:/m.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(setting.map((path) => relative(ROOT, path))).toEqual([]);
  });
});
