import { beforeAll, describe, expect, it } from "vitest";
import { DocsBuildError } from "./errors.js";
import { renderBody } from "./render.js";
import type { VariantContext } from "./variants.js";

const ctx: VariantContext = {
  project: "workshops",
  projects: ["workshops"],
  os: ["macos", "linux", "wsl"],
  file: "workshops/page.md",
};

// The first render loads Shiki's highlighter, which alone can outlast
// vitest's 5s per-test timeout on a cold CI runner.
beforeAll(async () => {
  await renderBody("", ctx);
}, 60_000);

describe("script in a page", () => {
  it.each([
    ["a script element", "Intro.\n\n<script>alert(1)</script>\n"],
    ["an SVG script", '<svg><script href="x.js"></script></svg>\n'],
    ["an event handler", '<img src="x.png" onerror="alert(1)">\n'],
    ["an unknown on* attribute", '<div onfoo="alert(1)">x</div>\n'],
    ["a javascript: link", "[click](javascript:alert(1))\n"],
    ["a javascript: href in HTML", '<a href="JavaScript:alert(1)">x</a>\n'],
    [
      "a javascript: URL hidden by a tab",
      '<a href="java&#9;script:alert(1)">x</a>\n',
    ],
    [
      "an SVG animation writing one",
      '<svg><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>\n',
    ],
  ])("fails the build on %s", async (_, page) => {
    await expect(renderBody(page, ctx)).rejects.toThrow(DocsBuildError);
  });

  it("names the file and line", async () => {
    await expect(
      renderBody("One.\n\nTwo.\n\n<script>x</script>\n", ctx),
    ).rejects.toThrow(/^workshops\/page\.md:5 \(in workshops\): `<script>`/);
  });

  it("keeps the raw HTML pages rely on", async () => {
    const html = await renderBody(
      [
        "<details><summary>More</summary>",
        "",
        "Hidden text.",
        "",
        "</details>",
        "",
        '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
        "",
        "```js",
        '<script>document.write("in a code block is fine")</script>',
        "```",
        "",
        "Mentioning `onclick=` or javascript: in prose is fine too.",
      ].join("\n"),
      ctx,
    );
    expect(html).toContain("<details>");
    expect(html).toContain("<circle");
    expect(html).toContain("in a code block is fine");
  });
});
