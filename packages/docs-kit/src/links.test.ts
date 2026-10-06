import { beforeAll, describe, expect, it } from "vitest";
import { classifyLink, linkSourceOf, siteHref } from "./links.js";
import { renderBody } from "./render.js";
import type { VariantContext } from "./variants.js";

const ctx: VariantContext = {
  project: "workshops",
  projects: ["platform", "workshops"],
  os: ["macos", "linux", "wsl"],
  file: "_shared/getting-started/running.md",
};

const shared = {
  project: "workshops",
  source: "_shared/getting-started/running",
};

// The first render loads Shiki's highlighter.
beforeAll(async () => {
  await renderBody("", ctx);
}, 60_000);

describe("classifyLink", () => {
  it("reads the source of a mounted copy as its _shared file", () => {
    expect(
      linkSourceOf({
        project: "workshops",
        path: "workshops/getting-started/running",
        mountedFrom: "getting-started/running",
      }),
    ).toEqual(shared);
  });

  it("maps a sibling shared page onto the current mount", () => {
    expect(classifyLink("./prerequisites.md#os-setup", shared)).toMatchObject({
      kind: "page",
      path: "workshops/getting-started/prerequisites",
      anchor: "os-setup",
    });
  });

  it("maps another project's file to that project, whatever the mount", () => {
    expect(
      classifyLink("../../platform/guides/migrations.md", shared),
    ).toMatchObject({ kind: "page", path: "platform/guides/migrations" });
  });

  it("lets ?project= pick another project's mount of a shared file", () => {
    expect(
      classifyLink("./prerequisites.md?project=platform", shared),
    ).toMatchObject({ path: "platform/getting-started/prerequisites" });
  });

  it("skips external links, site routes and assets", () => {
    for (const url of [
      "https://example.com",
      "mailto:a@b.c",
      "//cdn.example.com/x",
      "/teams",
      "./diagram.png",
    ]) {
      expect(classifyLink(url, shared).kind).toBe("skip");
    }
  });

  it("refuses the two retired forms", () => {
    expect(classifyLink("/docs/platform/x", shared).kind).toBe("invalid");
    expect(classifyLink("./running", shared).kind).toBe("invalid");
  });
});

describe("siteHref", () => {
  it("serves an index page at its folder", () => {
    expect(siteHref("platform/index", null)).toBe("/docs/platform");
    expect(siteHref("platform/guides/index", "a")).toBe(
      "/docs/platform/guides#a",
    );
    expect(siteHref("platform/guides/x", "a")).toBe(
      "/docs/platform/guides/x#a",
    );
  });
});

describe("renderBody link rewriting", () => {
  it("writes site URLs for page links, per mount", async () => {
    const html = await renderBody(
      "[a](./prerequisites.md#os) [b](../../platform/index.md) [c](https://x.dev) [d](#here)\n\n[e]: ./running.md\n",
      ctx,
      shared,
    );
    expect(html).toContain(
      'href="/docs/workshops/getting-started/prerequisites#os"',
    );
    expect(html).toContain('href="/docs/platform"');
    expect(html).toContain('href="https://x.dev"');
    expect(html).toContain('href="#here"');
  });

  it("leaves a link it cannot resolve as written", async () => {
    const html = await renderBody("[a](/docs/platform/x)", ctx, shared);
    expect(html).toContain('href="/docs/platform/x"');
  });
});
