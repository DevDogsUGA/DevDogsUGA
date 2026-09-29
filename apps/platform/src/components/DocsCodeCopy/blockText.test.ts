// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { newSide } from "~/components/DocsDiff";
import { blockText } from "./index";

function figure(html: string): Element {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.firstElementChild!;
}

describe("blockText", () => {
  it("copies a terminal's commands without prompts, notes or the idle prompt", () => {
    const terminal = figure(
      `<figure class="docs-code" data-kind="terminal"><pre><code>` +
        `<span class="line docs-shell-comment"># Clone it</span>\n` +
        `<span class="line"><span class="docs-prompt">~ ❯ </span>gh repo clone a/b</span>\n` +
        `<span class="line"><span class="docs-prompt">~/b main ❯ </span>pnpm install</span>\n` +
        `<span class="line docs-shell-idle"><span class="docs-prompt">❯ </span></span>` +
        `</code></pre></figure>`,
    );
    expect(blockText(terminal)).toBe("gh repo clone a/b\npnpm install");
  });

  it("copies code whole, less an excerpt's gap rows", () => {
    const code = figure(
      `<figure class="docs-code" data-kind="code"><pre><code>` +
        `<span class="line" data-line="7">create table t (</span>\n` +
        `<span class="line" data-line="8">);</span>\n` +
        `<span class="line docs-code-gap"></span>\n` +
        `<span class="line" data-line="15">alter table t;</span>` +
        `</code></pre></figure>`,
    );
    expect(blockText(code)).toBe("create table t (\n);\nalter table t;");
  });
});

describe("newSide", () => {
  it("keeps context and added lines, hunk by hunk", () => {
    const patch = [
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -1,2 +1,2 @@",
      " keep",
      "-old",
      "+new",
      "@@ -9,1 +9,2 @@",
      " tail",
      "+more",
    ].join("\n");
    expect(newSide(patch)).toBe("keep\nnew\n\ntail\nmore");
  });
});
