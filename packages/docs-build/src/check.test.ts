/**
 * The lint warns and never fails, which is exactly why it has to be right.
 * Nothing downstream breaks when it reports a defect that is not there, so the
 * only thing keeping it worth reading is that it does not cry wolf. Most of
 * what is below is about the false positive: markup inside a code fence or
 * under four spaces of indentation, a `#` that is a shell comment, a page whose
 * length is all inside folds.
 *
 * The other half is the false positive's quieter twin. An opening tag the
 * scanner invents leaves every line below it looking hidden, so the page's
 * visible word count stops climbing and `page-length`, the rule this whole lint
 * exists for, goes silent on the one page long enough to need it. Several of
 * the tests below check that a warning is still there rather than that a
 * phantom is gone.
 *
 * Two of these assert behaviour checked against `parseDocFile` rather than
 * assumed. A heading inside a `<details>` really is visited like any other and
 * becomes an entry in the page TOC, pointing at content behind a fold. And a
 * `</summary>` with no blank line after it really does leave everything down to
 * the closing tag as one raw HTML block. Put to `parseDocFile`, both the body
 * on the next line and the body on the `</summary>` line itself come back with
 * their markdown still spelled out in `plainText`, where the same page with a
 * blank line comes back parsed.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkDocFile,
  checkDocs,
  type CheckRule,
  type CheckWarning,
} from "./check.js";

function check(body: string): CheckWarning[] {
  return checkDocFile(body, "platform/example.md");
}

function rules(warnings: CheckWarning[]): CheckRule[] {
  return warnings.map((warning) => warning.rule);
}

function found(warnings: CheckWarning[], rule: CheckRule): CheckWarning {
  const warning = warnings.find((candidate) => candidate.rule === rule);
  expect(
    warning,
    `no ${rule} warning in ${rules(warnings).join(", ")}`,
  ).toBeDefined();
  return warning!;
}

/** `count` words of prose-shaped filler, on one line. */
function filler(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "docs-check-"));
}

describe("page length", () => {
  it("reports the number it measured, not just that there was one", () => {
    // The count is the whole value of the warning: it says how far over the
    // page is, which is the difference between "trim this" and "split this".
    expect(found(check(filler(1501)), "page-length").message).toContain(
      "1501 visible word(s)",
    );
  });

  it("leaves a page exactly at the budget alone", () => {
    expect(rules(check(filler(1500)))).not.toContain("page-length");
  });

  it("counts nothing inside a collapsible as visible", () => {
    const page = [
      filler(200),
      "",
      "<details>",
      "<summary>Every environment variable</summary>",
      "",
      filler(1400),
      "",
      "</details>",
    ].join("\n");

    // 1600 words in the file, 200 of them in front of the reader.
    expect(rules(check(page))).not.toContain("page-length");
    // The fold has its own, much smaller budget, and this one is over it.
    expect(rules(check(page))).toContain("details-length");
  });

  it("still measures a page whose fold never closes", () => {
    // Setting words aside as hidden is a loan against a closing tag, and this
    // page never repays it: everything below the opening tag would drop out of
    // the count, leaving a 3001-word page reporting its broken tag and nothing
    // whatever about its length. The pages where that goes wrong are the long
    // ones, which are the pages this rule is for.
    const page = [
      "<details>",
      "<summary>Everything</summary>",
      "",
      filler(3000),
    ].join("\n");

    expect(rules(check(page))).toContain("unbalanced-details");
    expect(found(check(page), "page-length").message).toContain(
      "3001 visible word(s)",
    );
  });
});

describe("headings inside a collapsible", () => {
  it("flags one, and points at the line it is on", () => {
    const page = [
      "# Page",
      "",
      "<details>",
      "<summary>Detail</summary>",
      "",
      "## Hidden",
      "",
      "Body.",
      "",
      "</details>",
    ].join("\n");

    const warning = found(check(page), "heading-in-details");
    expect(warning.line).toBe(6);
    expect(warning.message).toContain('"## Hidden"');
  });

  it("reads a `#` in a fenced sample the way remark does", () => {
    const page = [
      "<details>",
      "<summary>Install</summary>",
      "",
      "```bash",
      "# install the toolchain",
      "pnpm install",
      "```",
      "",
      "</details>",
    ].join("\n");

    expect(rules(check(page))).not.toContain("heading-in-details");
  });

  it("leaves a page's own headings alone", () => {
    expect(rules(check("# Page\n\n## Section\n\nBody.\n"))).toEqual([]);
  });

  it("counts lines past the front matter, so the number is the one to open", () => {
    const page = [
      "---",
      "name: Example",
      "description: A page with a fold in it.",
      "---",
      "",
      "<details>",
      "<summary>Detail</summary>",
      "",
      "### Hidden",
      "",
      "</details>",
    ].join("\n");

    expect(found(check(page), "heading-in-details").line).toBe(9);
  });
});

describe("collapsibles", () => {
  it("flags one that has become a page, summary text included", () => {
    const page = [
      "<details>",
      "<summary>Table</summary>",
      "",
      filler(400),
      "",
      "</details>",
    ].join("\n");

    const warning = found(check(page), "details-length");
    expect(warning.line).toBe(1);
    expect(warning.message).toContain("401 word(s)");
  });

  it("leaves a fold that is still an aside alone", () => {
    const page = [
      "<details>",
      "<summary>Table</summary>",
      "",
      filler(398),
      "",
      "</details>",
    ].join("\n");

    expect(rules(check(page))).not.toContain("details-length");
  });

  it("flags tags that do not pair up, and says which way", () => {
    const page = [
      "<details>",
      "<summary>One</summary>",
      "",
      "Body.",
      "",
      "<details>",
      "<summary>Two</summary>",
      "",
      "More body.",
      "",
      "</details>",
    ].join("\n");

    expect(found(check(page), "unbalanced-details").message).toContain(
      "2 <details> and 1 </details>",
    );
  });

  it("reads markup in a fenced sample as text", () => {
    // A page showing how to write one of these has to be able to print the
    // tags, and an excerpt is allowed to be an excerpt: read as markup this
    // would be an unbalanced tag with no blank line after its summary, which is
    // two warnings about a collapsible that does not exist.
    const page = [
      "Fold a long table away like this:",
      "",
      "```md",
      "<details>",
      "<summary>The table</summary>",
      "| a | b |",
      "```",
    ].join("\n");

    expect(rules(check(page))).toEqual([]);
  });

  it("reads a tag in a code span as a sentence about the markup", () => {
    // This is the shape that found the rule: a code span cannot open an
    // element, and this package's own doc comments name `<details>` in one.
    // `gen` prints those comments back onto
    // docs/toolkit/reference/api/docs-build.md, which carries them today with
    // no closing tag anywhere on it. Counted as markup, one mention opens a
    // collapsible nothing closes and drags every heading below it in behind it.
    const page = [
      "Fold it into a `<details>`, and mind the blank line after `</summary>`.",
      "",
      "## Still a heading nobody hid",
    ].join("\n");

    expect(rules(check(page))).toEqual([]);
  });

  it("flags a closer that cancels an opener it never belonged to", () => {
    // One of each, and nothing pairs up: the closer at the top closes nothing,
    // and the fold below it never closes. Counted as totals this page balances
    // and goes out silent, and the open fold has already taken every word under
    // it out of the visible count, so the length rule is silent too.
    const page = [
      "</details>",
      "",
      "<details>",
      "<summary>Detail</summary>",
      "",
      "Body.",
    ].join("\n");

    expect(found(check(page), "unbalanced-details").message).toContain(
      "1 <details> and 1 </details>, 1 of the closers with nothing open",
    );
  });
});

describe("code that no fence marks", () => {
  it("reads a tag under four spaces the way remark does", () => {
    // Put to the `remark` this package parses pages with, an indented sample
    // after a blank line comes back as a `code` node holding those two lines,
    // exactly as a fenced one does. Read as markup instead, it opens a
    // collapsible nothing closes, and the heading below it is reported as
    // hidden behind a fold that is not on the page.
    const page = [
      "Fold a long table away like this:",
      "",
      "    <details>",
      "    <summary>The table</summary>",
      "",
      "## Still a heading nobody hid",
    ].join("\n");

    expect(rules(check(page))).toEqual([]);
  });

  it("ends the block at the first line back out at the margin", () => {
    // Both shapes on one page, so a scanner that never left the indented block
    // fails as loudly as one that never entered it. The sample is not markup
    // and the tags under it are: one <details>, one </details>, and the only
    // thing to say about the page is the heading genuinely inside the fold.
    const page = [
      "Like this:",
      "",
      "    <details>",
      "",
      "And in earnest:",
      "",
      "<details>",
      "<summary>Detail</summary>",
      "",
      "### Hidden",
      "",
      "</details>",
    ].join("\n");

    expect(rules(check(page))).toEqual(["heading-in-details"]);
  });

  it("does not let an indented sample swallow the page's length", () => {
    // The failure worth a test is the silence, not the noise. Read as an
    // opening tag, the sample hides all 3000 words below it from the visible
    // count and the one rule with something to say about this page says
    // nothing at all.
    const page = ["    <details>", "", filler(3000)].join("\n");

    expect(found(check(page), "page-length").message).toContain(
      "3000 visible word(s)",
    );
  });

  it("reads an indented line under prose as the paragraph it continues", () => {
    // Four spaces alone are not code: indented code cannot interrupt a
    // paragraph, so with no blank line above it this really is a `<details>`,
    // and the heading really is behind it.
    const page = [
      "A paragraph, and then",
      "    <details>",
      "<summary>Detail</summary>",
      "",
      "## Hidden",
      "",
      "</details>",
    ].join("\n");

    expect(rules(check(page))).toContain("heading-in-details");
  });
});

describe("the blank line after </summary>", () => {
  it("flags a body CommonMark would swallow", () => {
    const page = [
      "<details>",
      "<summary>Detail</summary>",
      "**bold** and a [link](/docs)",
      "</details>",
    ].join("\n");

    expect(found(check(page), "summary-blank-line").line).toBe(2);
  });

  it("flags a body that never left the </summary> line", () => {
    // The newline is not what the rule is about, and a check that only looked
    // at the line below would miss the identical page written on one line
    // fewer. Put to `parseDocFile`, this comes back exactly as the two-line
    // form does: `**bold** and a [link](/docs)`, asterisks and brackets and
    // all, sitting in `plainText` unparsed.
    const page = [
      "<details>",
      "<summary>Detail</summary>**bold** and a [link](/docs)",
      "",
      "</details>",
    ].join("\n");

    expect(found(check(page), "summary-blank-line").line).toBe(2);
  });

  it("still reads a closing tag in a code span as prose", () => {
    // The line that makes the same-line check delicate: this one has a
    // `</summary>` on it and a sentence after it, and neither is markup.
    const page = "Mind the blank line after `</summary>`, and the fold closes.";

    expect(rules(check(page))).toEqual([]);
  });

  it("flags a code fence opening on the very next line", () => {
    const page = [
      "<details>",
      "<summary>Install</summary>",
      "```bash",
      "pnpm install",
      "```",
      "",
      "</details>",
    ].join("\n");

    expect(found(check(page), "summary-blank-line").line).toBe(2);
  });

  it("accepts the blank line", () => {
    const page = [
      "<details>",
      "<summary>Detail</summary>",
      "",
      "**bold** and a [link](/docs)",
      "",
      "</details>",
    ].join("\n");

    expect(rules(check(page))).toEqual([]);
  });

  it("accepts a fold with no body at all", () => {
    // Nothing follows the summary, so there is nothing for the HTML block to
    // swallow. A blank line here would change nothing on the page.
    expect(
      rules(
        check(
          ["<details>", "<summary>Detail</summary>", "</details>"].join("\n"),
        ),
      ),
    ).toEqual([]);
  });
});

describe("the description in front matter", () => {
  it("asks a long page for one, and says how long it is", () => {
    expect(found(check(filler(301)), "missing-description").message).toContain(
      "301 word(s)",
    );
  });

  it("leaves a short page to get on with it", () => {
    expect(rules(check(filler(300)))).toEqual([]);
  });

  it("accepts one in front matter", () => {
    const page = [
      "---",
      "description: What this page is for.",
      "---",
      "",
      filler(400),
    ].join("\n");

    expect(rules(check(page))).toEqual([]);
  });

  it("does not take a --- inside a block scalar for the end of it", () => {
    // `name: |` opens a YAML block scalar, and gray-matter reads the indented
    // --- as one of its lines rather than the closing delimiter. Checked
    // against gray-matter here, which returns the whole scalar and a body that
    // starts after the real delimiter. A scanner that stopped three lines early
    // would hand the remaining YAML to the body: 340 words on a 290-word page,
    // and a warning asking for a description this page does not need.
    const page = [
      "---",
      "name: |",
      "  a line",
      "  ---",
      `  ${filler(50)}`,
      "---",
      "",
      filler(290),
    ].join("\n");

    expect(rules(check(page))).toEqual([]);
  });

  it("does not count the front matter itself as words", () => {
    // 350 words in the file, 300 of them on the page. Counting the block would
    // push this over and warn about a page nobody has to do anything to.
    const page = ["---", `name: ${filler(50)}`, "---", "", filler(300)].join(
      "\n",
    );

    expect(rules(check(page))).toEqual([]);
  });
});

describe("checkDocs", () => {
  it("skips the generated reference, and the compiler's own output", () => {
    const root = tempDir();
    mkdirSync(join(root, "platform", "reference"), { recursive: true });
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "platform", "guide.md"), filler(2000), "utf-8");
    writeFileSync(
      join(root, "platform", "reference", "components.md"),
      filler(2000),
      "utf-8",
    );
    writeFileSync(join(root, "dist", "index.md"), filler(2000), "utf-8");

    const summary = checkDocs(root);

    expect(summary.pages).toBe(1);
    expect(summary.skipped).toBe(1);
    // Every warning is about the page a person wrote. A generated page is as
    // long as the code it enumerates, and no author picked its length.
    expect(
      summary.warnings.every((warning) => warning.file === "platform/guide.md"),
    ).toBe(true);
  });
});
