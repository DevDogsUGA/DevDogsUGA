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

const table = (value: string) =>
  `:::copyable\n| Setting | Value |\n| ------- | ----- |\n| Issuer URL | ${value} |\n:::\n`;

describe("copyable table cells", () => {
  it("puts a copy button beside a cell that is one code span", async () => {
    const html = await renderBody(table("`https://example.com/auth/v1`"), ctx);
    expect(html).toMatch(
      /<td><span class="docs-copyable"><code>https:\/\/example\.com\/auth\/v1<\/code><button type="button" class="docs-copyable-copy" data-copy-inline="" aria-label="Copy">/,
    );
  });

  it("leaves prose, links and several code spans alone", async () => {
    for (const value of [
      "From your client",
      "[Your OAuth page](https://devdogsuga.org/tools/oauth)",
      "`openid` and `email`",
    ]) {
      expect(await renderBody(table(value), ctx)).not.toContain(
        "data-copy-inline",
      );
    }
  });

  it("leaves the header row alone", async () => {
    const html = await renderBody(
      ":::copyable\n| `name` |\n| ------ |\n| prose |\n:::\n",
      ctx,
    );
    expect(html).not.toContain("data-copy-inline");
  });

  it("leaves a table outside :::copyable alone", async () => {
    const html = await renderBody("| Type |\n| ---- |\n| `string` |\n", ctx);
    expect(html).not.toContain("data-copy-inline");
  });

  it("works on a table indented in a list item", async () => {
    const html = await renderBody(
      "1. Fill it in:\n\n   :::copyable\n\n   | Setting | Value |\n   | ------- | ----- |\n   | Name | `DevDogs` |\n\n   :::\n",
      ctx,
    );
    expect(html).toContain("<li>");
    expect(html).toContain("data-copy-inline");
  });
});
