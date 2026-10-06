import { beforeAll, describe, expect, it } from "vitest";
import { DocsBuildError } from "./errors.js";
import { headingsOf, parseBody, plainTextOf } from "./parse.js";
import { renderBody } from "./render.js";
import type { VariantContext } from "./variants.js";

function ctx(overrides: Partial<VariantContext> = {}): VariantContext {
  return {
    project: "platform",
    projects: ["platform", "study-group-finder"],
    os: ["macos", "linux", "wsl"],
    file: "_shared/page.md",
    ...overrides,
  };
}

const sgf = ctx({
  project: "study-group-finder",
  os: ["macos", "linux", "wsl", "windows"],
});

// The first render loads Shiki's highlighter, which alone can outlast
// vitest's 5s per-test timeout on a cold CI runner.
beforeAll(async () => {
  await renderBody("", ctx());
}, 60_000);

/** One `<details name=… data-value=…>` tab, as an author writes it. */
function tab(group: string, value: string, body: string): string {
  return `<details name="${group}" data-value="${value}">\n<summary>${value}</summary>\n\n${body}\n\n</details>\n`;
}

/** One `<details data-…>` block, as an author writes it. */
function only(attributes: string, body: string): string {
  return `<details ${attributes}>\n<summary>Only</summary>\n\n${body}\n\n</details>\n`;
}

const tabs = [
  tab("os", "macos", "Use brew."),
  tab("os", "linux wsl", "Use apt."),
  tab("os", "windows", "Use winget."),
].join("\n");

describe("tabs", () => {
  it("renders a strip of every offered value and one panel per tab", async () => {
    const html = await renderBody(tabs, sgf);
    expect(html).toContain('<div class="docs-tabs" data-group="os">');
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html).toContain('data-value="windows">Windows (native)</button>');
    expect(html).toContain('data-values="linux wsl"');
  });

  it("drops a native-Windows tab from a project that does not offer it", async () => {
    const html = await renderBody(tabs, ctx());
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).not.toContain("winget");
  });

  it("fails when an offered value has no tab", () => {
    const partial = tabs.replace('value="linux wsl"', 'value="linux"');
    expect(() => parseBody(partial, ctx())).toThrow(/Windows \(WSL2\)/);
  });

  it("fails when two tabs cover the same value", () => {
    const doubled = tabs.replace('value="macos"', 'value="macos linux"');
    expect(() => parseBody(doubled, ctx())).toThrow(DocsBuildError);
  });

  it("fails on an unknown value or group", () => {
    expect(() => parseBody(tabs.replace('"macos"', '"mac"'), ctx())).toThrow(
      /unknown os value "mac"/,
    );
    expect(() =>
      parseBody(tabs.replaceAll('name="os"', 'name="shell"'), ctx()),
    ).toThrow(DocsBuildError);
  });

  it("refuses a heading inside a tab", () => {
    const withHeading = tabs.replace("Use brew.", "## Brew\n\nUse brew.");
    expect(() => parseBody(withHeading, ctx())).toThrow(/heading/);
  });

  it("drops the chrome when one tab covers every value", async () => {
    const html = await renderBody(
      tab("os", "macos linux wsl", "Same everywhere."),
      ctx(),
    );
    expect(html).toBe("<p>Same everywhere.</p>");
  });

  it("indexes every panel's text for search", () => {
    const text = plainTextOf(parseBody(tabs, sgf));
    expect(text).toContain("Use brew.");
    expect(text).toContain("Use winget.");
  });
});

describe("code-fence shorthand", () => {
  const fences = [
    "```bash os=macos",
    "brew install fnm",
    "```",
    '```bash os="linux wsl"',
    "curl -fsSL https://fnm.vercel.app/install | bash",
    "```",
  ].join("\n");

  it("groups adjacent tagged fences into one tab set", async () => {
    const html = await renderBody(fences, ctx());
    expect(html.match(/class="docs-tabs"/g)).toHaveLength(1);
    expect(html.match(/class="docs-tabpanel"/g)).toHaveLength(2);
    expect(html).not.toContain("os=");
  });

  it("holds the shorthand to the same coverage rule", () => {
    expect(() => parseBody(fences, sgf)).toThrow(/Windows \(native\)/);
  });
});

describe("only", () => {
  const page = `
# Setup

${only('data-project="study-group-finder"', "## Flutter\n\nInstall Flutter.")}
Done.
`;

  it("keeps a project's block, headings included, in that project's copy", () => {
    const tree = parseBody(page, sgf);
    expect(headingsOf(tree).map((h) => h.title)).toEqual(["Setup", "Flutter"]);
  });

  it("drops it from every other copy", () => {
    const tree = parseBody(page, ctx());
    expect(headingsOf(tree).map((h) => h.title)).toEqual(["Setup"]);
    expect(plainTextOf(tree)).not.toContain("Flutter");
  });

  it("fails on an unknown project", () => {
    expect(() =>
      parseBody(page.replace("study-group-finder", "sgf"), ctx()),
    ).toThrow(/unknown project "sgf"/);
  });

  it("hides an os block at runtime rather than dropping it", async () => {
    const html = await renderBody(
      only('data-os="windows"', "Enable Developer Mode."),
      sgf,
    );
    expect(html).toContain(
      'class="docs-only" data-group="os" data-values="windows"',
    );
    expect(await renderBody(only('data-os="windows"', "x"), ctx())).toBe("");
  });
});

describe("details syntax", () => {
  it("renders an os tab group the same as a bare block of tabs", async () => {
    const html = await renderBody(tabs, sgf);
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
  });

  it("groups only consecutive details that share a name", async () => {
    const html = await renderBody(
      [
        tab("os", "macos linux wsl", "Everywhere."),
        tab("supabase", "hosted", "Hosted."),
        tab("supabase", "local", "Local."),
      ].join("\n"),
      ctx(),
    );
    expect(html.match(/class="docs-tabs"/g)).toHaveLength(1);
    expect(html).toContain('data-group="supabase"');
  });

  it("leaves a plain collapsible alone", async () => {
    const html = await renderBody(
      "<details>\n<summary>More</summary>\n\nBody.\n\n</details>\n",
      ctx(),
    );
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>More</summary>");
  });

  it("nests a plain collapsible and a block inside a variant", () => {
    const inner = "<details>\n<summary>More</summary>\n\nBody.\n\n</details>";
    const nested = only(
      'data-project="platform"',
      `${only('data-project="platform"', "Inner.")}\n${inner}`,
    );
    expect(plainTextOf(parseBody(nested, ctx()))).toContain("Inner.");
    expect(plainTextOf(parseBody(nested, sgf))).not.toContain("Inner.");
  });

  it("fails on body text glued to the summary", () => {
    expect(() =>
      parseBody(
        '<details data-project="platform">\n<summary>x</summary>\nText\n\n</details>\n',
        ctx(),
      ),
    ).toThrow(/blank line/);
  });

  it("fails on a variant details with no summary", () => {
    expect(() =>
      parseBody(
        '<details data-project="platform">\n\nText\n\n</details>\n',
        ctx(),
      ),
    ).toThrow(/summary/);
  });

  it("fails on a details that is never closed", () => {
    expect(() =>
      parseBody(
        '<details data-project="platform">\n<summary>x</summary>\n\nText\n',
        ctx(),
      ),
    ).toThrow(/never closed/);
  });

  it("fails on an unknown attribute or an unknown group", () => {
    expect(() =>
      parseBody(only('data-project="platform" data-flavor="x"', "x"), ctx()),
    ).toThrow(/data-flavor/);
    expect(() => parseBody(tab("shell", "bash", "x"), ctx())).toThrow(
      /name must be/,
    );
  });

  it("refuses a heading inside an os block", () => {
    expect(() =>
      parseBody(only('data-os="windows"', "## Windows\n\nx"), sgf),
    ).toThrow(/heading/);
  });

  it("no longer reads the directive syntax", () => {
    expect(() =>
      parseBody(':::only{project="platform"}\nx\n:::\n', ctx()),
    ).toThrow(/unknown directive :::only/);
    expect(() => parseBody('::tab{value="macos"}\n', ctx())).toThrow(
      /unknown directive ::tab/,
    );
  });
});

describe("text directives", () => {
  it("puts back prose that merely looks like one", async () => {
    const html = await renderBody(
      "Connect to host:port, ratio 3:2 :tada:",
      ctx(),
    );
    expect(html).toContain("host:port");
    expect(html).toContain("3:2");
    expect(html).toContain("🎉");
  });

  it("fails on an unknown block directive", () => {
    expect(() => parseBody(":::note\nx\n:::\n", ctx())).toThrow(
      /unknown directive :::note/,
    );
  });
});
