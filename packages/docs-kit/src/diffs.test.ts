import { beforeAll, describe, expect, it } from "vitest";
import type { DocsDiff } from "./diffs.js";
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

const patch = [
  "--- a/components/Guestbook.tsx",
  "+++ b/components/Guestbook.tsx",
  "@@ -1,2 +1,2 @@",
  ' "use client";',
  '-import { useState } from "react";',
  '+import { useEffect, useState } from "react";',
].join("\n");

function placeholders(html: string): DocsDiff[] {
  return [
    ...html.matchAll(/<div data-docs-diff="([A-Za-z0-9+/=]+)"><\/div>/g),
  ].map(
    (m) =>
      JSON.parse(Buffer.from(m[1]!, "base64").toString("utf-8")) as DocsDiff,
  );
}

describe("diff blocks", () => {
  it("turns a top-level diff block naming its file into a placeholder", async () => {
    const html = await renderBody(
      `Intro.\n\n\`\`\`diff file=components/Guestbook.tsx lang=tsx\n${patch}\n\`\`\`\n`,
      ctx,
    );
    expect(placeholders(html)).toEqual([
      { file: "components/Guestbook.tsx", lang: "tsx", icon: "tsx", patch },
    ]);
    expect(html).not.toContain("<pre");
  });

  it("takes the language from the file's extension when lang is absent", async () => {
    const html = await renderBody(
      `\`\`\`diff file=lib/guestbook.dart\n${patch}\n\`\`\`\n`,
      ctx,
    );
    expect(placeholders(html)[0]?.lang).toBe("dart");
  });

  it("leaves a plain diff block, and a nested one, as highlighted code", async () => {
    const html = await renderBody(
      `\`\`\`diff\n${patch}\n\`\`\`\n\n- Item\n\n  \`\`\`diff file=a.ts\n  ${patch.split("\n").join("\n  ")}\n  \`\`\`\n`,
      ctx,
    );
    expect(placeholders(html)).toEqual([]);
    expect(html.match(/<pre/g)).toHaveLength(2);
  });

  it("refuses a file diff that is not a unified diff", async () => {
    await expect(
      renderBody("```diff file=a.ts\n+ just a line\n```\n", ctx),
    ).rejects.toThrow(/needs a unified diff/);
  });
});

describe("whole-file diff blocks", () => {
  // Line 11 is blank, and its context line trimmed the way Prettier leaves it.
  const before = Array.from({ length: 20 }, (_, i) =>
    i === 10 ? "" : `line ${i + 1}`,
  );
  const whole = [
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,20 +1,21 @@",
    ...before.slice(0, 9).map((l) => ` ${l}`),
    "-line 10",
    "+line ten",
    "+line ten and a half",
    ...before.slice(10).map((l) => ` ${l}`.trimEnd()),
  ];

  it("carries a vscode= link", async () => {
    const link =
      "vscode://devdogsuga.workshops/review?repo=o%2Fr&to=t&file=a.ts";
    const html = await renderBody(
      `\`\`\`diff file=a.ts context=2 vscode=${link}\n${whole.join("\n")}\n\`\`\`\n`,
      ctx,
    );
    expect(placeholders(html)[0]?.vscode).toBe(link);
  });

  it("carries both files and a patch cut to the given context", async () => {
    const html = await renderBody(
      `\`\`\`diff file=a.ts context=2 href=https://github.com/o/r/compare/a...b\n${whole.join("\n")}\n\`\`\`\n`,
      ctx,
    );
    const [diff] = placeholders(html);
    expect(diff?.href).toBe("https://github.com/o/r/compare/a...b");
    expect(diff?.patch.split("\n")).toEqual([
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -8,5 +8,6 @@",
      " line 8",
      " line 9",
      "-line 10",
      "+line ten",
      "+line ten and a half",
      " ",
      " line 12",
    ]);
    expect(diff?.oldContent?.split("\n")).toHaveLength(20);
    expect(diff?.newContent?.split("\n")).toHaveLength(21);
    expect(diff?.newContent?.split("\n")[9]).toBe("line ten");
  });

  it("refuses context= on a diff that is not the whole file", async () => {
    await expect(
      renderBody(
        `\`\`\`diff file=a.ts context=3\n${patch.replace("-1,2 +1,2", "-5,2 +5,2")}\n\`\`\`\n`,
        ctx,
      ),
    ).rejects.toThrow(/whole file/);
  });
});
