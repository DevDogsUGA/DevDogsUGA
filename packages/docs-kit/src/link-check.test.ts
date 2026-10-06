import { describe, expect, it } from "vitest";
import { checkLinks } from "./link-check.js";
import type { CompiledPage } from "./types.js";

function page(overrides: Partial<CompiledPage> = {}): CompiledPage {
  return {
    title: "Untitled",
    description: null,
    order: null,
    frontmatter: {},
    headings: [],
    content: "",
    plainText: "",
    project: "platform",
    path: "platform/index",
    section: null,
    mountedFrom: null,
    publishAt: null,
    variants: {
      project: overrides.project ?? "platform",
      projects: [],
      os: ["macos", "linux", "wsl"],
      file: "test.md",
    },
    ...overrides,
  };
}

describe("checkLinks", () => {
  it("passes a relative .md link that resolves", () => {
    const pages = [
      page({
        path: "platform/index",
        content: "See [setup](./setup.md).",
      }),
      page({ path: "platform/setup", title: "Setup" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails a relative .md link to a page that does not exist", () => {
    const pages = [page({ content: "See [setup](./nowhere.md)." })];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("platform/nowhere");
  });

  it("fails a link into a project that does not exist", () => {
    const pages = [page({ content: "[x](../not-a-project/setup.md)" })];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
  });

  it("resolves a relative .md link against the linking page's own directory", () => {
    const pages = [
      page({
        path: "platform/guides/one",
        content: "[two](./two.md)",
      }),
      page({ path: "platform/guides/two", title: "Two" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("resolves a relative .md link that climbs a directory", () => {
    const pages = [
      page({ path: "platform/guides/one", content: "[index](../index.md)" }),
      page({ path: "platform/index" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails a relative .md link with no matching page", () => {
    const pages = [
      page({ path: "platform/guides/one", content: "[gone](./gone.md)" }),
    ];
    expect(checkLinks(pages)).toHaveLength(1);
  });

  it("checks an anchor against the target page's own headings", () => {
    const pages = [
      page({ content: "[setup](./setup.md#install)" }),
      page({
        path: "platform/setup",
        headings: [{ id: "install", title: "Install", depth: 2 }],
      }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails an anchor the target page does not declare", () => {
    const pages = [
      page({ content: "[setup](./setup.md#nope)" }),
      page({
        path: "platform/setup",
        headings: [{ id: "install", title: "Install", depth: 2 }],
      }),
    ];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("nope");
  });

  it("checks a same-page #anchor link", () => {
    const pages = [
      page({
        content: "[jump](#top)",
        headings: [{ id: "top", title: "Top", depth: 1 }],
      }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails a same-page #anchor link with no matching heading", () => {
    const pages = [page({ content: "[jump](#nowhere)" })];
    expect(checkLinks(pages)).toHaveLength(1);
  });

  it("ignores external links", () => {
    const pages = [
      page({
        content:
          "[a](https://example.com) [b](mailto:x@example.com) [c](//example.com/x)",
      }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("ignores a link written inside a fenced code sample", () => {
    const pages = [page({ content: "```md\n[gone](./nowhere.md)\n```\n" })];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("resolves a folder link to a folder with its own index page", () => {
    const pages = [
      page({ content: "[gs](./getting-started/)" }),
      page({
        path: "platform/getting-started/index",
        title: "Getting started",
      }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("resolves a folder link to a folder with no index but real children", () => {
    const pages = [
      page({ content: "[gs](./getting-started/)" }),
      page({ path: "platform/getting-started/windows", title: "Windows" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("checks an anchor on a folder link against the folder's index page", () => {
    const pages = [
      page({ content: "[gs](./getting-started/#install)" }),
      page({
        path: "platform/getting-started/index",
        headings: [{ id: "install", title: "Install", depth: 2 }],
      }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails an anchor the folder's index page does not declare", () => {
    const pages = [
      page({ content: "[gs](./getting-started/#nope)" }),
      page({ path: "platform/getting-started/index" }),
    ];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("nope");
  });

  it("leaves an anchor unverified on a folder link with no index page", () => {
    const pages = [
      page({ content: "[gs](./getting-started/#whatever)" }),
      page({ path: "platform/getting-started/windows" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails a link to a folder that has no pages under it at all", () => {
    const pages = [page({ content: "[gs](./nowhere/)" })];
    expect(checkLinks(pages)).toHaveLength(1);
  });

  it("resolves a relative .md link that climbs a directory, with a trailing anchor", () => {
    const pages = [
      page({
        path: "toolkit/guides/env/commands",
        content: "[env](../env.md#some-heading)",
      }),
      page({
        path: "toolkit/guides/env",
        headings: [{ id: "some-heading", title: "Some heading", depth: 2 }],
      }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("resolves a relative folder link to a page that only exists as a folder", () => {
    const pages = [
      page({ path: "toolkit/index", content: "[env](./guides/env/)" }),
      page({ path: "toolkit/guides/env/commands" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails a file link to a folder that has no page of its own", () => {
    const pages = [
      page({ path: "toolkit/index", content: "[env](./guides/env.md)" }),
      page({ path: "toolkit/guides/env/commands" }),
    ];
    expect(checkLinks(pages)).toHaveLength(1);
  });

  it("refuses an absolute /docs/ link, even one that resolves", () => {
    const pages = [
      page({ content: "[setup](/docs/platform/setup)" }),
      page({ path: "platform/setup" }),
    ];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("absolute /docs/ URL");
  });

  it("refuses a relative link with no extension, even one that resolves", () => {
    const pages = [
      page({ path: "platform/guides/one", content: "[two](./two)" }),
      page({ path: "platform/guides/two" }),
    ];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("no file extension");
  });

  it("refuses a link that climbs out of docs/", () => {
    const pages = [page({ content: "[x](../../README.md)" })];
    expect(checkLinks(pages)[0]?.message).toContain("outside docs/");
  });

  it("checks link definitions as well as inline links", () => {
    const pages = [page({ content: "[x][1]\n\n[1]: ./nowhere.md" })];
    expect(checkLinks(pages)).toHaveLength(1);
  });

  it("ignores a relative link to a non-markdown asset", () => {
    const pages = [page({ content: "![logo](./assets/logo.svg)" })];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("checks a mounted page's relative link once per project it lands in", () => {
    const pages = [
      page({
        path: "platform/getting-started/troubleshooting",
        mountedFrom: "getting-started/troubleshooting",
        publishAt: null,
        content: "[faq](../faq.md)",
      }),
      page({ path: "platform/faq" }),
      page({
        path: "toolkit/getting-started/troubleshooting",
        project: "toolkit",
        mountedFrom: "getting-started/troubleshooting",
        publishAt: null,
        content: "[faq](../faq.md)",
      }),
      // toolkit/faq deliberately missing, so this mount fails independently.
    ];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe("_shared/getting-started/troubleshooting.md");
  });

  describe("_shared", () => {
    const shared = (project: string, rel: string, content: string) =>
      page({
        project,
        path: `${project}/${rel}`,
        mountedFrom: rel,
        content,
      });

    it("resolves a link to a sibling shared page to the same mount", () => {
      const pages = [
        shared("platform", "getting-started/a", "[b](./b.md)"),
        shared("platform", "getting-started/b", ""),
        shared("workshops", "getting-started/a", "[b](./b.md)"),
        shared("workshops", "getting-started/b", ""),
      ];
      expect(checkLinks(pages)).toEqual([]);
    });

    it("resolves a link from a project page to the shared file's mount", () => {
      const pages = [
        page({
          project: "workshops",
          path: "workshops/index",
          content: "[p](../_shared/getting-started/a.md)",
        }),
        shared("workshops", "getting-started/a", ""),
      ];
      expect(checkLinks(pages)).toEqual([]);
    });

    it("refuses a link at a mounted copy's own path, which GitHub has no file for", () => {
      const pages = [
        page({
          project: "workshops",
          path: "workshops/index",
          content: "[p](./getting-started/a.md)",
        }),
        shared("workshops", "getting-started/a", ""),
      ];
      const errors = checkLinks(pages);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain("../_shared/getting-started/a.md");
    });

    it("names another project's mount with ?project=", () => {
      const pages = [
        page({
          project: "toolkit",
          path: "toolkit/index",
          content: "[p](../_shared/guides/db.md?project=platform)",
        }),
        shared("platform", "guides/db", ""),
      ];
      expect(checkLinks(pages)).toEqual([]);
    });

    it("refuses a query off a _shared link, and any query but ?project=", () => {
      const pages = [
        page({
          content: "[a](./b.md?project=platform) [c](../_shared/x.md?plain=1)",
        }),
      ];
      expect(checkLinks(pages)).toHaveLength(2);
    });

    it("links into a project folder reach that project's page from any mount", () => {
      const pages = [
        shared(
          "workshops",
          "getting-started/a",
          "[g](../../platform/guides/g.md)",
        ),
        page({ path: "platform/guides/g" }),
      ];
      expect(checkLinks(pages)).toEqual([]);
    });
  });
});
