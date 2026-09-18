import { describe, expect, it } from "vitest";
import { darkModeCss, paintCss } from "../darkmode.js";
import { ISSUES } from "../issues.js";
import {
  emailImages,
  emailRenderContext,
  previewRenderContext,
  renderIssueDocument,
} from "./index.js";

function imageSources(html: string): string[] {
  return [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]!);
}

/** Authored copy as React's renderer emits it: apostrophes and quotes escaped. */
function escaped(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#x27;")
    .replace(/"/g, "&quot;");
}

describe("renderIssueDocument", () => {
  it("renders every issue as a full document carrying its own copy", () => {
    for (const issue of ISSUES) {
      const html = renderIssueDocument(issue);
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain(escaped(issue.tagline));
      expect(html).toContain(escaped(issue.featured.title));
      expect(html).toContain(escaped(issue.signoff));
      expect(html).toContain(`v${issue.version}`);
    }
  });

  it("references only images the manifest embeds, as cid: URLs", () => {
    const cids = new Set(emailImages().map((image) => `cid:${image.cid}`));
    for (const issue of ISSUES) {
      const sources = imageSources(renderIssueDocument(issue));
      expect(sources.length).toBeGreaterThan(0);
      for (const src of sources) {
        expect(cids.has(src), `unembedded image source ${src}`).toBe(true);
      }
    }
  });

  it("renders self-contained previews with data-URI images", () => {
    const html = renderIssueDocument(ISSUES[0]!, previewRenderContext());
    const sources = imageSources(html);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      expect(src.startsWith("data:image/svg+xml")).toBe(true);
    }
  });

  it("never emits the font shorthand classic Outlook misreads", () => {
    const html = renderIssueDocument(ISSUES[0]!);
    expect(html).not.toMatch(/style="[^"]*[^-]font:/);
  });

  it("declares both color schemes and embeds the dark-mode pins", () => {
    const html = renderIssueDocument(ISSUES[0]!);
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain(
      'name="supported-color-schemes" content="light dark"',
    );
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain("[data-ogsc]");
    expect(html).toContain("[data-ogsb]");
  });

  it("pins every inline color against dark-mode rewriting", () => {
    // The web Outlooks recolor inline styles in dark mode; for text and
    // borders (which they leave alone or repair tolerably) the escape hatch
    // is a class per color plus a matching rule in darkModeCss(). This walks
    // every rendered element and fails on any painted color that is missing
    // either half, so a new color cannot land unpinned.
    const css = darkModeCss();
    const pins = [
      { pattern: /(?:^|;)color:(#[0-9a-f]{6})/, prefix: "tc" },
      {
        pattern:
          /border(?:-top|-right|-bottom|-left)?:1px solid (#[0-9a-f]{6})/,
        prefix: "brc",
      },
    ];
    for (const issue of ISSUES) {
      for (const element of renderIssueDocument(issue).split("<")) {
        const style = /style="([^"]*)"/.exec(element)?.[1];
        if (!style) continue;
        const classes = /class="([^"]*)"/.exec(element)?.[1] ?? "";
        for (const { pattern, prefix } of pins) {
          const hex = pattern.exec(style)?.[1];
          if (!hex) continue;
          const pin = `${prefix}-${hex.slice(1)}`;
          expect(
            classes,
            `${hex} painted without .${pin} in <${element}`,
          ).toContain(pin);
          expect(css, `.${pin} has no rule in darkModeCss()`).toContain(
            `.${pin}{`,
          );
        }
      }
    }
  });

  it("carries every background in classes, never inline", () => {
    // Received-copy forensics (2026-09-11): the web Outlooks' dark mode
    // rewrites INLINE backgrounds in place with inline !important, which no
    // stylesheet rule can outrank — while stylesheet colors arrive untouched
    // and rewritten bgcolor attributes stay presentational hints any rule
    // beats. So backgrounds ride only in bc- classes (painted by paintCss,
    // pinned by darkModeCss) plus a bgcolor attribute for clients without
    // <style>. The one exception is <body>: its inline background is the
    // sacrificial donor Outlook repaints and stamps with data-ogsb, which is
    // what activates every scoped pin below it.
    const paint = paintCss();
    const pins = darkModeCss();
    for (const issue of ISSUES) {
      const html = renderIssueDocument(issue);
      expect(html).toContain(`.bc-13121b{background-color:#13121b`);
      expect(html).toContain(".bg-slants{");
      expect(html).toContain(".bg-dots{");
      for (const element of html.split("<")) {
        const style = /style="([^"]*)"/.exec(element)?.[1];
        const classes = /class="([^"]*)"/.exec(element)?.[1] ?? "";
        if (style && !element.startsWith("body")) {
          expect(style, `inline background in <${element}`).not.toContain(
            "background",
          );
        }
        const bgcolor = /bgcolor="(#[0-9a-f]{6})"/.exec(element)?.[1];
        if (bgcolor) {
          expect(
            classes,
            `bgcolor ${bgcolor} without its bc- class in <${element}`,
          ).toContain(`bc-${bgcolor.slice(1)}`);
        }
        for (const cls of classes.split(" ")) {
          if (!cls.startsWith("bc-")) continue;
          expect(paint, `.${cls} has no rule in paintCss()`).toContain(
            `.${cls}{background-color:#${cls.slice(3)}`,
          );
          expect(pins, `.${cls} has no scoped pin`).toContain(
            `[data-ogsb] .${cls}{`,
          );
        }
      }
    }
  });
});

describe("emailImages", () => {
  it("yields renderable SVG at 2x display size for every mark", () => {
    const images = emailImages();
    expect(images.map((image) => image.cid)).toEqual([
      ...new Set(images.map((image) => image.cid)),
    ]);
    for (const image of images) {
      expect(image.svg.trimStart().startsWith("<svg")).toBe(true);
      expect(image.rasterWidth).toBeGreaterThan(0);
    }
  });

  it("matches the context the send renders with", () => {
    const ctx = emailRenderContext();
    const cids = new Set(emailImages().map((image) => `cid:${image.cid}`));
    expect(cids.has(ctx.assets.devdogsLockup)).toBe(true);
    expect(cids.has(ctx.assets.gdgcLockup)).toBe(true);
    expect(cids.has(ctx.assets.socialIcon("discord"))).toBe(true);
  });
});
