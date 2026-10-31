import { beforeAll, describe, expect, it } from "vitest";
import { renderBodyPlain } from "./render-plain.js";
import { renderBody } from "./render.js";
import type { VariantContext } from "./variants.js";

const ctx: VariantContext = {
  project: "demo",
  projects: ["demo"],
  os: ["macos", "linux", "wsl"],
  file: "demo/page.md",
};

beforeAll(async () => {
  await renderBody("", ctx);
}, 60_000);

const bar = (html: string) => html.slice(0, html.indexOf("<pre"));
const text = (html: string) => html.replace(/<[^>]+>/g, "");
const attr = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) => m[1]);
const classes = (html: string) =>
  new Set(
    [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(" ")),
  );

const FENCES = [
  "```ts file=lib/a.ts\nconst a = 1;\n\nlet b;\n```",
  "```ts file=lib/a.ts lines=7-8,12\nconst a = 1;\nlet b;\nlet c;\n```",
  "```bash cwd=app branch=<github-username>\ngit clone https://example.com/x.git\ncd x\n# note\npnpm install\n```",
  "```text\nplain words\n```",
  "```ts href=https://github.com/DevDogsUGA/x\nx\n```",
];

describe("plain code blocks", () => {
  it.each(FENCES)(
    "carry the highlighted block's frame, lines and text: %s",
    async (fence) => {
      const markdown = `# Page\n\n${fence}\n`;
      const shiki = await renderBody(markdown, ctx);
      const plain = await renderBodyPlain(markdown, ctx);

      expect(bar(plain)).toBe(bar(shiki));
      expect(attr(plain, "data-line")).toEqual(attr(shiki, "data-line"));
      expect(text(plain)).toBe(text(shiki));
      for (const name of [
        "docs-code",
        "docs-code-bar",
        "docs-code-tab",
        "docs-prompt",
        "docs-shell-comment",
        "docs-shell-idle",
        "docs-code-gap",
      ]) {
        expect(classes(plain).has(name), name).toBe(classes(shiki).has(name));
      }
      expect(plain).toContain('<pre class="shiki"');
      // No token colours: the one inline style is the block's own ground.
      expect(plain.match(/style="[^"]*"/g)).toEqual([
        'style="--shiki-dark:#e0def4;--shiki-dark-bg:#232136"',
      ]);
    },
  );

  it("marks the placeholder for the reader's GitHub login, as the highlighted block does", async () => {
    const markdown =
      "```bash\ngit clone https://github.com/<github-username>/x\n```\n";
    const plain = await renderBodyPlain(markdown, ctx);
    expect(plain).toContain("data-github-username");
    expect(plain).toBe(
      plain.replace(/\n$/, "") + (plain.endsWith("\n") ? "\n" : ""),
    );
  });

  it("refuses the fences the highlighted renderer refuses", async () => {
    const bad = [
      "```ts lines=1-9\nconst a = 1;\n```",
      "```ts vscode=https://example.com/x\nx\n```",
    ];
    for (const fence of bad) {
      const markdown = `# P\n\n${fence}\n`;
      const shiki = await renderBody(markdown, ctx).then(
        () => null,
        (e: Error) => e.message,
      );
      const plain = await renderBodyPlain(markdown, ctx).then(
        () => null,
        (e: Error) => e.message,
      );
      expect(shiki).not.toBeNull();
      expect(plain).toBe(shiki);
    }
  });

  it("names a language Shiki would not know as written, where the highlighted block says text", async () => {
    // The one difference in the frame: plain code cannot ask Shiki which
    // grammars it has, so an unregistered language keeps its own name.
    const markdown = "```unknownlang\nkey: value\n```\n";
    const plain = await renderBodyPlain(markdown, ctx);
    const shiki = await renderBody(markdown, ctx);
    expect(text(plain)).toContain("unknownlang");
    expect(text(shiki)).toContain("Text");
  });

  it("leaves inline code and prose alone", async () => {
    const html = await renderBodyPlain("Use `pnpm i` here.\n", ctx);
    expect(html).toContain("<code>pnpm i</code>");
    expect(html).not.toContain("docs-code");
  });
});
