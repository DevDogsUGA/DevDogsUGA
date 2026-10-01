import { beforeAll, describe, expect, it } from "vitest";
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

describe("code block frame", () => {
  it("names the tab after the file, and numbers lines as the file does", async () => {
    const html = await renderBody(
      "```ts file=lib/a.ts lines=7-8,10\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```\n",
      ctx,
    );
    expect(html).toContain('<figure class="docs-code" data-kind="code">');
    expect(html).toMatch(
      /<span class="docs-code-tab"><svg [^>]*data-icon="ts"[^>]*>.*?<\/svg>lib\/a\.ts<\/span>/,
    );
    expect([...html.matchAll(/data-line="(\d+)"/g)].map((m) => m[1])).toEqual([
      "7",
      "8",
      "10",
    ]);
    expect(html.match(/docs-code-gap/g)).toHaveLength(1);
    expect(html).toContain("data-copy");
  });

  it("names an untitled block's tab after its language, and counts from 1", async () => {
    const html = await renderBody("```sql\nselect 1;\n```\n", ctx);
    expect(html).toMatch(/data-icon="sql"[^>]*>.*?<\/svg>SQL<\/span>/);
    expect(html).toContain('data-line="1"');
  });

  it("refuses a lines= that does not name one number per line", async () => {
    await expect(
      renderBody("```ts lines=1-3\nconst a = 1;\n```\n", ctx),
    ).rejects.toThrow(/names 3 line\(s\) for a block of 1/);
  });

  it("draws a shell block as a terminal whose prompt follows the commands", async () => {
    const html = await renderBody(
      "```bash cwd=~\n# Clone it\ngh repo clone DevDogsUGA/Web-Workshops\ncd Web-Workshops\ngit switch 01-nextjs-intro\npnpm install\n```\n",
      ctx,
    );
    expect(html).toContain('data-kind="terminal"');
    expect(html).toContain('data-icon="terminal"');
    expect(html).not.toContain("data-line");
    expect(html).toContain("docs-shell-comment");
    const prompts = [
      ...html.matchAll(
        /<span class="docs-prompt-cwd">([^<]*)<\/span>(?:<span class="docs-prompt-git"> ([^<]*)<\/span>)?/g,
      ),
    ].map((m) => `${m[1]}${m[2] ? `@${m[2]}` : ""}`);
    // Four commands, then the idle prompt.
    expect(prompts).toEqual([
      "~",
      "~",
      "~/Web-Workshops@main",
      "~/Web-Workshops@01-nextjs-intro",
      "~/Web-Workshops@01-nextjs-intro",
    ]);
  });
});

describe("code block links", () => {
  it("puts an href= link beside the copy button", async () => {
    const html = await renderBody(
      "```ts file=lib/a.ts href=https://github.com/o/r/blob/abc/lib/a.ts#L1\nconst a = 1;\n```\n",
      ctx,
    );
    expect(html).toContain(
      '<a class="docs-code-link" href="https://github.com/o/r/blob/abc/lib/a.ts#L1" target="_blank" rel="noopener noreferrer"',
    );
  });

  it("adds no link without one", async () => {
    const html = await renderBody("```ts\nconst a = 1;\n```\n", ctx);
    expect(html).not.toContain("docs-code-link");
  });
});

describe("VS Code links", () => {
  const review =
    "vscode://devdogsuga.workshops/review?repo=DevDogsUGA%2FWeb-Workshops&from=02-supabase%2F00-start&to=02-supabase%2F01-read&file=lib%2Fa.ts";
  const open =
    "vscode://devdogsuga.workshops/open?repo=DevDogsUGA%2FWeb-Workshops&ref=02-supabase%2F01-read&file=lib%2Fa.ts&lines=7-8";

  it("puts a VS Code icon before the copy button", async () => {
    const html = await renderBody(
      `\`\`\`ts file=lib/a.ts vscode=${review}\nconst a = 1;\n\`\`\`\n`,
      ctx,
    );
    expect(html).toContain(
      `<a class="docs-code-vscode" href="${review.replaceAll("&", "&#x26;")}"`,
    );
    expect(html).toContain('aria-label="Review in VS Code"');
    expect(html.indexOf("docs-code-vscode")).toBeLessThan(
      html.indexOf("data-copy"),
    );
  });

  it("says Open for an /open link", async () => {
    const html = await renderBody(
      `\`\`\`ts file=lib/a.ts vscode=${open}\nconst a = 1;\n\`\`\`\n`,
      ctx,
    );
    expect(html).toContain('aria-label="Open in VS Code"');
  });

  it("gives a terminal no button", async () => {
    const html = await renderBody(
      `\`\`\`bash vscode=${review}\nls\n\`\`\`\n`,
      ctx,
    );
    expect(html).not.toContain("docs-code-vscode");
  });

  it("adds none without one", async () => {
    const html = await renderBody("```ts\nconst a = 1;\n```\n", ctx);
    expect(html).not.toContain("docs-code-vscode");
  });

  it("fails the build on any other link", async () => {
    await expect(
      renderBody("```ts vscode=https://example.com/\nconst a = 1;\n```\n", ctx),
    ).rejects.toThrow(/vscode=https:\/\/example\.com\//);
  });
});

/** The text inside each `<span data-github-username>`, tags and entities dropped. */
function markedTexts(html: string): string[] {
  const out: string[] = [];
  const open = '<span data-github-username="">';
  for (
    let at = html.indexOf(open);
    at !== -1;
    at = html.indexOf(open, at + 1)
  ) {
    let depth = 1;
    let i = at + open.length;
    while (depth > 0) {
      const next = /<(\/?)span\b/g;
      next.lastIndex = i;
      const m = next.exec(html)!;
      depth += m[1] ? -1 : 1;
      i = m.index + 1;
    }
    out.push(
      html
        .slice(at + open.length, i - 1)
        .replace(/<[^>]*>/g, "")
        .replace(/&#x3C;/g, "<"),
    );
  }
  return out;
}

describe("git switch -c / -C in a terminal", () => {
  const branches = (html: string) =>
    [
      ...html.matchAll(
        /<span class="docs-prompt-git">(.*?)<\/span><span class="docs-prompt-arrow">/g,
      ),
    ].map((m) =>
      m[1]!
        .replace(/<[^>]*>/g, "")
        .replace(/&#x3C;/g, "<")
        .trim(),
    );

  it("follows -c and -C onto the new branch, not its start point", async () => {
    const html = await renderBody(
      "```bash cwd=~/Web-Workshops branch=main\ngit switch -c ada/02-supabase origin/01-nextjs-intro\ngit switch -C ada/03-x 02-supabase/01-read --discard-changes\ngit switch --create ada/04\ngit switch main\n```\n",
      ctx,
    );
    expect(branches(html)).toEqual([
      "main",
      "ada/02-supabase",
      "ada/03-x",
      "ada/04",
      "main",
    ]);
  });

  it("follows a branch named with <github-username>, and marks the label", async () => {
    const html = await renderBody(
      "```bash cwd=~/Web-Workshops branch=main\ngit switch -c <github-username>/02-supabase origin/01-nextjs-intro\ngit switch -C <github-username>/02-supabase 02-supabase/01-read --discard-changes\n```\n",
      ctx,
    );
    expect(branches(html)).toEqual([
      "main",
      "<github-username>/02-supabase",
      "<github-username>/02-supabase",
    ]);
    expect(html).toContain(
      '<span class="docs-prompt-git"> <span data-github-username="">&#x3C;github-username></span>/02-supabase</span>',
    );
  });
});

describe("<github-username> placeholder", () => {
  it("wraps each placeholder in one marker, however the highlighter split it", async () => {
    const html = await renderBody(
      "```bash\ngit switch -c <github-username>/02-supabase origin/01-nextjs-intro\necho <github-username> <github-username>\n```\n",
      ctx,
    );
    // Three in the commands, plus the branch label on the echo's prompt and the idle one.
    expect(markedTexts(html)).toEqual(Array(5).fill("<github-username>"));
  });

  it("marks it in non-shell blocks too, and nothing else", async () => {
    const html = await renderBody(
      '```ts\nconst me = "<github-username>";\nconst you = 1;\n```\n',
      ctx,
    );
    expect(markedTexts(html)).toEqual(["<github-username>"]);
  });

  it("leaves blocks without the placeholder unmarked", async () => {
    const html = await renderBody("```bash\ngit switch main\n```\n", ctx);
    expect(html).not.toContain("data-github-username");
  });
});
