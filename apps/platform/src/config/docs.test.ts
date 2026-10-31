// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOCS_MENU,
  DOCS_MENU_PROJECTS,
  docsProjectHue,
  inDocsGuide,
} from "./docs";
import * as docsConfig from "./docs";
import * as nav from "./nav";

const SRC = new URL("..", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|css|md)$/.test(name) ? [path] : [];
  });
}

describe("the label and mark maps are gone", () => {
  const removed = [
    "DOCS_PROJECT_LABELS",
    "DOCS_PROJECT_MARKS",
    "DOCS_FALLBACK_MARK",
    "docsProjectMark",
    "DOCS_LANDING_LARGE",
    "DOCS_LANDING_SMALL",
    "DOCS_LANDING_WORKSHOPS",
    "docsProjectKind",
    "DocsProjectLink",
  ];

  it("exports none of them", () => {
    for (const name of removed) {
      expect(Object.keys(docsConfig), name).not.toContain(name);
    }
  });

  it("is named by nothing in the platform's source, docs, workflows or guides", () => {
    const here = new URL(import.meta.url).pathname;
    const roots = [
      SRC,
      new URL("../../../../docs/", import.meta.url).pathname,
      new URL("../../../../.github/", import.meta.url).pathname,
    ];
    const files = roots.flatMap((root) =>
      sources(root).filter(
        (f) =>
          f !== here && !f.includes("/dist/") && !f.includes("node_modules"),
      ),
    );
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, "utf-8");
      return removed
        .filter((name) => text.includes(name))
        .map((name) => `${file}: ${name}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe("the Docs menu's rows", () => {
  it("name platform-authored docs only: the three sections and the guides for building on DevDogs", () => {
    expect(DOCS_MENU.map((item) => item.id)).toEqual([
      "workshops",
      "toolkit",
      "operations",
      "oauth",
      "moderation",
      "sdk",
    ]);
    expect([...DOCS_MENU_PROJECTS].sort()).toEqual([
      "operations",
      "toolkit",
      "workshops",
    ]);
  });

  it("gives every guide its own words, and every project row none (its docs name it)", () => {
    for (const item of DOCS_MENU) {
      if (item.project) {
        expect(item.name, item.id).toBeUndefined();
        expect(item.href).toBe(`/docs/${item.project}`);
      } else {
        expect(item.name, item.id).toBeTruthy();
        expect(item.description, item.id).toBeTruthy();
      }
    }
  });

  it("keeps the section hues the docs have always worn", () => {
    expect(docsProjectHue("workshops")).toBe("workshop");
    expect(docsProjectHue("toolkit")).toBe("build");
    expect(docsProjectHue("platform")).toBeUndefined();
  });

  it("knows which addresses are building-on-DevDogs guides", () => {
    expect(inDocsGuide("/docs/platform/guides/identity")).toBe(true);
    expect(inDocsGuide("/docs/platform/guides/reporting/integrating")).toBe(
      true,
    );
    expect(inDocsGuide("/docs/toolkit/reference/api/sdk/db/schema")).toBe(true);
    expect(inDocsGuide("/docs/platform/guides/testing")).toBe(false);
    expect(inDocsGuide("/docs/platform/guides/identityx")).toBe(false);
  });
});

describe("the public links", () => {
  it("lead with Docs and Contribute, and Contribute lands on the docs page's Contribute group", () => {
    const links = nav.PUBLIC_LINKS.map((link) => link.label);
    expect(links.slice(-2)).toEqual(["Docs", "Contribute"]);
    expect(nav.PUBLIC_LINKS.find((l) => l.label === "Contribute")?.href).toBe(
      nav.CONTRIBUTE_HREF,
    );
    expect(nav.CONTRIBUTE_HREF).toBe("/docs#contribute");
  });
});
