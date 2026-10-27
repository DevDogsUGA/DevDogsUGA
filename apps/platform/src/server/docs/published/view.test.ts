import { describe, expect, it } from "vitest";
import { findFolder } from "~/lib/docsTree";
import { DIGEST, content, pointer } from "./fixtures";
import {
  assetUrl,
  buildPublishedProject,
  pageHtml,
  publishedSidebar,
  publishedStepNav,
  publishedTree,
  type PublishedPage,
} from "./view";

const project = () => buildPublishedProject(pointer(), content());

function withHtml(html: string, path = "index") {
  const p = project();
  const page: PublishedPage = { ...p.pages.get("index")!, path, html };
  return pageHtml(p, page);
}

describe("the project's tree", () => {
  it("lays pages out project-relative, overview first", () => {
    const p = project();
    const sidebar = publishedSidebar(p);
    expect(sidebar.overview?.path).toBe("index");
    expect(sidebar.sections.map((s) => s.id)).toEqual(["guides"]);
    expect(publishedTree(p).map((n) => n.type)).toContain("folder");
  });

  it("reads folder settings and step courses", () => {
    const c = content();
    c.folders = [
      {
        path: "demo/guide",
        name: "The guide",
        description: null,
        order: null,
        steps: true,
      },
    ];
    c.pages.push({
      ...c.pages[1]!,
      path: "demo/guide/second",
      title: "Second",
      order: 2,
    });
    const p = buildPublishedProject(pointer(), c);
    expect(findFolder(publishedTree(p), "guide")?.name).toBe("The guide");
    const nav = publishedStepNav(p, "guide/second");
    expect(nav?.course).toBe("The guide");
    expect(nav?.index).toBe(0);
    expect(nav?.steps.map((s) => s.path)).toEqual([
      "guide/second",
      "guide/start",
    ]);
    expect(publishedStepNav(p, "index")).toBeNull();
  });
});

describe("pageHtml", () => {
  it("points an image at this version's asset route", () => {
    expect(withHtml('<img src="pic.svg" alt="pic">')).toBe(
      `<img src="${assetUrl(project(), "pic.svg")}" alt="pic">`,
    );
    expect(assetUrl(project(), "pic.svg")).toBe(
      `/docs-assets/demo/${DIGEST}/pic.svg`,
    );
  });

  it("resolves a reference against the page's directory", () => {
    expect(withHtml('<img src="../img/shot.png">', "guide/start")).toBe(
      `<img src="/docs-assets/demo/${DIGEST}/img/shot.png">`,
    );
    expect(withHtml('<img src="./pic.svg">')).toContain("/docs-assets/demo/");
  });

  it("takes the URL off a reference that is not an approved asset", () => {
    for (const src of [
      "missing.png",
      "../../pic.svg",
      "../pic.svg",
      "https://evil.example/x.png",
      "//evil.example/x.png",
      "/docs-assets/other/x.png",
      "data:image/svg+xml,<svg/>",
      "%2e%2e/pic.svg",
      "pic.svg%00",
      "%",
    ]) {
      expect(withHtml(`<img src="${src}" alt="x">`), src).toBe('<img alt="x">');
    }
  });

  it("rewrites a link to an asset and leaves page links and external links alone", () => {
    expect(withHtml('<a href="pic.svg">file</a>')).toContain(
      `href="/docs-assets/demo/${DIGEST}/pic.svg"`,
    );
    const untouched =
      '<a href="/docs/demo/guide/start">a</a><a href="#pd-demo--x">b</a><a href="https://example.com" rel="noopener noreferrer nofollow">c</a><a href="mailto:a@b.c">d</a>';
    expect(withHtml(untouched)).toBe(untouched);
  });

  it("is not fooled by markup inside an attribute value", () => {
    const html = '<img alt="a > b src=&#x22;x.png" src="pic.svg">';
    expect(withHtml(html)).toBe(
      `<img alt="a > b src=&#x22;x.png" src="/docs-assets/demo/${DIGEST}/pic.svg">`,
    );
  });

  it("changes nothing else: what the compiler stripped stays stripped, what it kept stays kept", () => {
    const html =
      '<h1 id="pd-demo--a"><a href="#pd-demo--a">A</a></h1><pre class="shiki" style="--shiki-dark:#fff" tabindex="0"><code>x &lt; y</code></pre><svg viewBox="0 0 1 1"><use href="#pd-demo--p"></use></svg><details><summary>s</summary>t</details>';
    expect(withHtml(html)).toBe(html);
  });

  it("does not turn page text into markup", () => {
    const html = "<p>&lt;img src=&quot;pic.svg&quot;&gt; and src=pic.svg</p>";
    expect(withHtml(html)).toBe(html);
  });

  it("never emits an image URL outside the site's own origin", () => {
    const out = withHtml(
      '<img src="pic.svg"><img src="https://x.test/a.png"><img src="img/shot.png">',
    );
    for (const [, url] of out.matchAll(/src="([^"]*)"/g)) {
      expect(url).toMatch(/^\/docs-assets\/demo\/[0-9a-f]{64}\//);
    }
  });
});
