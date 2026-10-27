import { beforeAll, describe, expect, it } from "vitest";
import { DocsBuildError } from "./errors.js";
import { renderBody } from "./render.js";
import { checkSvgAsset, type RenderPolicy } from "./sanitize.js";
import type { VariantContext } from "./variants.js";

const ctx: VariantContext = {
  project: "proj",
  projects: ["proj"],
  os: ["macos", "linux", "wsl"],
  file: "proj/guides/page.md",
};

const untrusted: RenderPolicy = {
  trust: "untrusted",
  untrusted: {
    project: "proj",
    dir: "guides",
    assets: new Set(["img/logo.png", "guides/shot.png"]),
  },
};

const render = (page: string, policy: RenderPolicy = untrusted) =>
  renderBody(
    page,
    ctx,
    { project: "proj", source: "proj/guides/page" },
    policy,
  );

beforeAll(async () => {
  await render("");
}, 60_000);

/** Both policies must refuse these: they are hostile for the club's own docs too. */
const hostileEverywhere: [string, string, RegExp][] = [
  ["a script element", "<script>alert(1)</script>", /<script>/],
  [
    "a script in a comment-looking wrapper",
    "<scr<script>ipt>x</scr</script>ipt>",
    /script/,
  ],
  ["an event handler", '<img src="x.png" onerror="alert(1)">', /event-handler/],
  [
    "an uppercase event handler",
    '<div ONCLICK="x()">hi</div>',
    /event-handler/,
  ],
  ["a javascript: link", "[x](javascript:alert(1))", /javascript:/],
  [
    "a javascript: link with a tab",
    '<a href="java&#9;script:alert(1)">x</a>',
    /javascript:/,
  ],
  [
    "an entity-encoded javascript: scheme",
    '<a href="&#106;avascript&colon;alert(1)">x</a>',
    /javascript:/,
  ],
  [
    "a hex-entity javascript: scheme",
    '<a href="&#x6A;avascript:alert(1)">x</a>',
    /javascript:/,
  ],
  [
    "a leading-space javascript: scheme",
    '<a href=" \njavascript:alert(1)">x</a>',
    /javascript:/,
  ],
  ["a vbscript: link", '<a href="vbscript:msgbox(1)">x</a>', /vbscript:/],
  [
    "a data:text/html link",
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    /data:/,
  ],
  ["an iframe", '<iframe src="https://evil.example"></iframe>', /iframe/],
  [
    "an iframe srcdoc",
    '<iframe srcdoc="<script>1</script>"></iframe>',
    /iframe/,
  ],
  ["an object", '<object data="x.swf"></object>', /object/],
  ["an embed", '<embed src="x.swf">', /embed/],
  [
    "a form",
    '<form action="https://evil.example"><input name="a"></form>',
    /form/,
  ],
  ["a style element", "<style>body{display:none}</style>", /style/],
  ["a style attribute", '<p style="position:fixed;inset:0">x</p>', /style/],
  ["a CSS expression", '<p style="width:expression(alert(1))">x</p>', /style/],
  [
    "a CSS url() trick",
    '<div style="background:url(javascript:alert(1))">x</div>',
    /style/,
  ],
  ["a base element", '<base href="https://evil.example/">', /base/],
  [
    "a meta refresh",
    '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    /meta/,
  ],
  [
    "a link element",
    '<link rel="stylesheet" href="https://evil.example/x.css">',
    /link/,
  ],
  ["MathML", "<math><mtext><script>1</script></mtext></math>", /math|script/],
  ["a template", "<template><script>1</script></template>", /template|script/],
  ["an SVG script", "<svg><script>alert(1)</script></svg>", /script/],
  [
    "an SVG foreignObject",
    "<svg><foreignObject><iframe src=x></iframe></foreignObject></svg>",
    /foreignObject/,
  ],
  [
    "an SVG animation setting a URL",
    '<svg><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>',
    /set|`a`|<a>/,
  ],
  [
    "an SVG animate",
    '<svg><animate attributeName="href" values="javascript:1"/></svg>',
    /animate/,
  ],
  [
    "an SVG use of an external file",
    '<svg><use href="https://evil.example/x.svg#a"/></svg>',
    /same-file/,
  ],
  [
    "an SVG use via xlink:href",
    '<svg><use xlink:href="https://evil.example/x.svg#a"/></svg>',
    /xlink:href/,
  ],
  [
    "an SVG image",
    '<svg><image href="https://evil.example/x.png"/></svg>',
    /image/,
  ],
  [
    "an SVG style element",
    "<svg><style>@import url(https://evil.example/x.css)</style></svg>",
    /style/,
  ],
  [
    "an SVG with a style attribute",
    '<svg><rect style="fill:url(https://evil.example/a)"/></svg>',
    /style/,
  ],
  [
    "an SVG fill with an external url()",
    '<svg><rect fill="url(https://evil.example/a)"/></svg>',
    /url\(\)/,
  ],
  [
    "an SVG with a foreign xmlns",
    '<svg xmlns="http://evil.example/ns"></svg>',
    /xmlns/,
  ],
  ["an SVG event handler", '<svg onload="alert(1)"></svg>', /event-handler/],
  [
    "an SVG a/href javascript",
    '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
    /<a>|javascript/,
  ],
  ["a button", "<button>go</button>", /button/],
  ["an unknown custom element", "<x-evil>hi</x-evil>", /x-evil/],
  [
    "a <video> with an onerror",
    '<video src="x" onerror="1"></video>',
    /event-handler|video/,
  ],
  [
    "an unknown data attribute",
    '<div data-docs-diff="e30=">x</div>',
    /data-docs-diff/,
  ],
  [
    "an SVG data: href",
    '<svg><use href="data:image/svg+xml,<svg/>"/></svg>',
    /same-file/,
  ],
];

describe("hostile content, both policies", () => {
  describe.each([
    ["untrusted", untrusted],
    ["trusted", { trust: "trusted" } satisfies RenderPolicy],
  ] as const)("%s", (_name, policy) => {
    it.each(hostileEverywhere)("rejects %s", async (_label, page, message) => {
      const result = render(`Intro.\n\n${page}\n`, policy);
      await expect(result).rejects.toThrow(DocsBuildError);
      await expect(result).rejects.toThrow(message);
    });
  });

  it("names the file and line", async () => {
    await expect(
      render("One.\n\nTwo.\n\n<iframe src=x></iframe>\n"),
    ).rejects.toThrow(/^proj\/guides\/page\.md:5 \(in proj\): `<iframe>`/);
  });

  it("does not let a nested markdown block hide HTML from the check", async () => {
    await expect(
      render(
        "<div>\n\n**bold** and <iframe src=x></iframe>\n\n- item <script>1</script>\n\n</div>\n",
      ),
    ).rejects.toThrow(DocsBuildError);
  });

  it("does not let raw HTML claim to be compiler-generated", async () => {
    await expect(
      render('<div data-docs-gen="" data-docs-gen-x="" onclick="1">x</div>'),
    ).rejects.toThrow(DocsBuildError);
  });
});

describe("comments", () => {
  it("drops comments in untrusted docs, tags and all", async () => {
    const html = await render(
      "A.\n\n<!-- <script>alert(1)</script> -->\n\nB.\n",
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("<!--");
  });

  it("drops a conditional-comment payload", async () => {
    const html = await render(
      "A <!--[if IE]><script>1</script><![endif]--> B\n",
    );
    expect(html).not.toContain("<script");
  });

  it("never turns an unterminated comment into live markup", async () => {
    const html = await render("A <!-- <img src=x onerror=alert(1)>\n").catch(
      () => "",
    );
    expect(html).not.toMatch(/<img/);
  });
});

describe("fence-meta links", () => {
  const fence = (meta: string) => `\`\`\`${meta}\nx\n\`\`\`\n`;
  const diff = (meta: string) =>
    `\`\`\`diff ${meta}\n--- a/f.ts\n+++ b/f.ts\n@@ -1 +1 @@\n-a\n+b\n\`\`\`\n`;
  const both = [
    ["untrusted", untrusted],
    ["trusted", { trust: "trusted" } satisfies RenderPolicy],
  ] as const;
  describe.each(both)("%s", (_n, policy) => {
    it("rejects a javascript: href", async () => {
      await expect(
        render(fence("js href=javascript:alert(1)"), policy),
      ).rejects.toThrow(/href=/);
    });
    it("rejects a javascript: href on a diff", async () => {
      await expect(
        render(diff("file=f.ts href=javascript:alert(1)"), policy),
      ).rejects.toThrow(/href=/);
    });
  });
  it("untrusted refuses vscode= and non-http hrefs, and adds nofollow", async () => {
    await expect(
      render(fence("js vscode=vscode://devdogsuga.workshops/open?x=1")),
    ).rejects.toThrow(/vscode=/);
    await expect(render(fence("js href=mailto:a@b.example"))).rejects.toThrow(
      /http\(s\)/,
    );
    const html = await render(fence("js href=https://github.com/a/b"));
    expect(html).toContain("nofollow");
  });
});

describe("link normalization and site routes", () => {
  it("normalizes tab-split schemes and still adds rel", async () => {
    const html = await render('<a href="ht&#9;tps://evil.example">x</a>');
    expect(html).toContain('href="https://evil.example"');
    expect(html).toContain("nofollow");
  });
  it.each([
    ["dot segments", "/docs/proj/../../account/delete"],
    ["encoded dots", "/docs/proj/%2e%2e/%2e%2e/account"],
  ])("rejects %s out of the project's docs", async (_l, href) => {
    await expect(render(`<a href="${href}">x</a>`)).rejects.toThrow(
      DocsBuildError,
    );
  });
});

describe("untrusted links and assets", () => {
  it("adds rel to external links and keeps https and mailto", async () => {
    const html = await render(
      '[a](https://example.com) and [b](mailto:a@example.com) and <a href="http://x.example">c</a>\n',
    );
    expect(html.match(/rel="noopener noreferrer nofollow"/g)).toHaveLength(3);
  });

  it.each([
    ["ftp", "[x](ftp://example.com/f)"],
    ["tel", "[x](tel:+15555550100)"],
    ["file", "[x](file:///etc/passwd)"],
    ["a protocol-relative", "[x](//evil.example/a)"],
    ["a backslash", '<a href="\\\\evil.example">x</a>'],
    ["an absolute site path", "[x](/teams)"],
    ["another project's docs", "[x](/docs/platform/guides/a)"],
  ])("rejects %s link", async (_label, page) => {
    await expect(render(page)).rejects.toThrow(DocsBuildError);
  });

  it("rejects a page link into another project", async () => {
    await expect(render("[x](../../platform/guides/a.md)\n")).rejects.toThrow(
      /links must stay inside|climbs out/,
    );
  });

  it("accepts approved relative images and links to pages", async () => {
    const html = await render(
      "![logo](../img/logo.png) ![s](./shot.png) [next](./other.md#a)\n",
    );
    expect(html).toContain('src="../img/logo.png"');
    expect(html).toContain('href="/docs/proj/guides/other#a"');
  });

  it.each([
    ["traversal", "![x](../../../etc/passwd.png)"],
    ["traversal past the root", "![x](../../secret.png)"],
    ["an absolute path", "![x](/etc/passwd)"],
    ["a missing asset", "![x](./missing.png)"],
    ["an external image", "![x](https://evil.example/pixel.gif)"],
    ["a data image", "![x](data:image/png;base64,AAAA)"],
    ["an encoded traversal", "![x](..%2f..%2f..%2fsecret.png)"],
    ["a backslash traversal", '<img src="..\\..\\secret.png">'],
    ["a protocol-relative image", '<img src="//evil.example/p.png">'],
  ])("rejects an image with %s", async (_label, page) => {
    await expect(render(page)).rejects.toThrow(DocsBuildError);
  });
});

describe("trusted keeps its hooks", () => {
  const trusted: RenderPolicy = { trust: "trusted" };

  it("allows class and id, details data attributes, and http images", async () => {
    const html = await render(
      '<div class="note" id="n">x</div>\n\n<img src="https://example.com/a.png" alt="a">\n',
      trusted,
    );
    expect(html).toContain('class="note"');
  });

  it("untrusted refuses an id on the root svg", async () => {
    await expect(
      render('<svg id="location"><circle r="1"/></svg>'),
    ).rejects.toThrow(/root `<svg>`/);
  });

  it("untrusted refuses class and id", async () => {
    await expect(render('<div class="fixed inset-0">x</div>')).rejects.toThrow(
      /class/,
    );
    await expect(render('<p id="__NEXT_DATA__">x</p>')).rejects.toThrow(/id/);
  });
});

describe("svg assets", () => {
  it("accepts a plain SVG", () => {
    expect(() =>
      checkSvgAsset(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path d="M0 0h4v4z" fill="#123"/></svg>',
        "a.svg",
      ),
    ).not.toThrow();
  });

  it.each([
    [
      "script",
      '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
    ],
    ["onload", '<svg onload="1"></svg>'],
    ["foreignObject", "<svg><foreignObject></foreignObject></svg>"],
    ["external use", '<svg><use href="https://evil.example/x.svg#a"/></svg>'],
    ["an entity DOCTYPE", '<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>'],
    ["a stylesheet PI", '<?xml-stylesheet href="x.css"?><svg/>'],
    ["trailing HTML", "<svg></svg><script>1</script>"],
    ["not an svg", "<html><body>hi</body></html>"],
  ])("rejects %s", (_label, text) => {
    expect(() => checkSvgAsset(text, "a.svg")).toThrow(DocsBuildError);
  });
});
