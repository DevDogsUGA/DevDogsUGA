/**
 * The compiler's two ordering decisions. A project's position comes from its
 * own index page and nothing else: a nested `index.md` positions its folder in
 * the sidebar, and mistaking one for the other would let a generated reference
 * page reshuffle the docs landing page. The flat page array stays in path
 * order, because consumers index it by path rather than read it in order.
 *
 * These run against a real directory: `compileDocs` reads the filesystem, and
 * a fake of `fs` would be testing the fake.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileDocs } from "./compile.js";

let root: string;

function write(rel: string, source: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, "utf-8");
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-order-"));

  write(
    "platform/index.md",
    "---\nname: Platform\norder: 1\n---\n\n# Platform\n",
  );
  write("platform/getting-started.md", "# Getting Started\n");
  write(
    "platform/reference/components/index.md",
    "---\nname: Components\norder: 118\n---\n\n# Components\n",
  );

  // Ordered the same as Platform, so the name tiebreak is what separates them.
  write(
    "study-group-finder/index.md",
    "---\nname: Study Group Finder\norder: 1\n---\n\n# SGF\n",
  );

  // No order at all: it takes the default and sorts by name against the rest.
  write("apis/index.md", "---\nname: APIs\n---\n\n# APIs\n");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("compileDocs ordering", () => {
  it("sorts projects by order, then by name", () => {
    const { projects } = compileDocs(root);
    expect(projects.map((project) => project.name)).toEqual([
      "Platform",
      "Study Group Finder",
      "APIs",
    ]);
  });

  it("takes a project's order from its own index page only", () => {
    const { projects } = compileDocs(root);
    const platform = projects.find((project) => project.slug === "platform");
    expect(platform?.order).toBe(1);

    // An unordered project stays null rather than being written to the
    // default, so the number lives in exactly one place.
    const apis = projects.find((project) => project.slug === "apis");
    expect(apis?.order).toBeNull();
  });

  it("carries each page's own order through", () => {
    const { pages } = compileDocs(root);
    const byPath = new Map(pages.map((page) => [page.path, page.order]));
    expect(byPath.get("platform/reference/components/index")).toBe(118);
    expect(byPath.get("platform/getting-started")).toBeNull();
  });

  it("leaves the page array in path order, whatever the pages declare", () => {
    const { pages } = compileDocs(root);
    expect(pages.map((page) => page.path)).toEqual([
      "apis/index",
      "platform/getting-started",
      "platform/index",
      "platform/reference/components/index",
      "study-group-finder/index",
    ]);
  });
});
