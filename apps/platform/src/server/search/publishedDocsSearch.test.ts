import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBucket, publication } from "~/server/docs/published/fixtures";
import type { DocsBucket } from "~/server/docs/published/bucket";

const { bucketRef } = vi.hoisted(() => ({
  bucketRef: { current: null as DocsBucket | null },
}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("~/server/docs/published/bucket", () => ({
  docsBucket: () => bucketRef.current,
}));
vi.mock("@devdogsuga/docs", () => ({
  projects: [],
  pages: [],
  folders: [],
  variantGroups: {},
}));
// The database index is not touched: importing this module must not need it.
vi.mock("~/server/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("search must not touch the database");
      },
    },
  ),
}));

import { searchPublishedDocs, snippetHtml } from "./publishedDocsSearch";

beforeEach(() => {
  bucketRef.current = fakeBucket({
    ...publication("demo"),
    ...publication("other"),
  });
});

describe("searchPublishedDocs", () => {
  it("folds each published project's entries in, labelled with the project", async () => {
    const hits = await searchPublishedDocs("welcome", { limit: 10 });
    expect(hits.map((h) => h.id).sort()).toEqual([
      "docs:demo:demo/index",
      "docs:other:other/index",
    ]);
    const hit = hits.find((h) => h.id === "docs:demo:demo/index")!;
    expect(hit).toMatchObject({
      group: "docs",
      title: "Demo",
      url: "/docs/demo/index",
      breadcrumbs: ["Contribute", "Demo"],
    });
    expect(hit.snippet).toContain("<mark>welcome</mark>");
  });

  it("needs every word, and ranks a title above body text", async () => {
    expect(await searchPublishedDocs("welcome nonsense", { limit: 5 })).toEqual(
      [],
    );
    const hits = await searchPublishedDocs("start", { limit: 5 });
    expect(hits[0]?.title).toBe("Start here");
    expect(hits[0]?.url).toBe("/docs/demo/guide/start");
    expect(hits[0]?.breadcrumbs).toEqual(["Contribute", "Demo", "Guide"]);
    expect(hits.map((h) => h.url)).toEqual([
      "/docs/demo/guide/start",
      "/docs/other/guide/start",
    ]);
  });

  it("honours the limit and an empty query", async () => {
    expect(await searchPublishedDocs("demo", { limit: 1 })).toHaveLength(1);
    expect(await searchPublishedDocs("   ", { limit: 5 })).toEqual([]);
  });

  it("returns nothing without a bucket", async () => {
    bucketRef.current = null;
    expect(await searchPublishedDocs("demo", { limit: 5 })).toEqual([]);
  });
});

describe("snippetHtml", () => {
  it("escapes the page's text and never splits an entity", () => {
    const html = snippetHtml("Install the thing & <run> it. amp lt", [
      "amp",
      "run",
    ]);
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;<mark>run</mark>&gt;");
    expect(html).not.toContain("<run>");
    expect(html).not.toMatch(/&<mark>/);
  });

  it("keeps a long page to a window around the first match", () => {
    const html = snippetHtml(
      `${"word ".repeat(100)}needle ${"x ".repeat(100)}`,
      ["needle"],
    );
    expect(html.startsWith("… ")).toBe(true);
    expect(html.endsWith(" …")).toBe(true);
    expect(html).toContain("<mark>needle</mark>");
    expect(html.length).toBeLessThan(260);
  });
});
