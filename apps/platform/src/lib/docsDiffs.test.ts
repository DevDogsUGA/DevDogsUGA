import { describe, expect, it } from "vitest";
import { splitDocsDiffs } from "./docsDiffs";

function placeholder(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return `<div data-docs-diff="${btoa(String.fromCharCode(...bytes))}"></div>`;
}

const diff = {
  file: "lib/guestbook.dart",
  lang: "dart",
  patch: "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-'é'\n+\"ü\"",
};

describe("splitDocsDiffs", () => {
  it("cuts the page around each diff, keeping the HTML either side", () => {
    expect(
      splitDocsDiffs(`<p>Before</p>${placeholder(diff)}<p>After</p>`),
    ).toEqual([
      { kind: "html", html: "<p>Before</p>" },
      { kind: "diff", ...diff },
      { kind: "html", html: "<p>After</p>" },
    ]);
  });

  it("returns a page with no diffs as one run of HTML", () => {
    expect(splitDocsDiffs("<p>Only</p>")).toEqual([
      { kind: "html", html: "<p>Only</p>" },
    ]);
  });

  it("leaves a placeholder it cannot read in the HTML", () => {
    const bad = placeholder({ file: "x" });
    expect(splitDocsDiffs(`<p>A</p>${bad}`)).toEqual([
      { kind: "html", html: `<p>A</p>${bad}` },
    ]);
  });
});
