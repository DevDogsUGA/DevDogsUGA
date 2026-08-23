/**
 * `order` is the one frontmatter key read as a number, and the only one whose
 * bad values would be invisible: a title typo shows up on the page, whereas a
 * NaN reaching a comparator just leaves the sidebar in some arbitrary order
 * nobody can trace back to the file that caused it. So the rejections are
 * tested as carefully as the acceptance.
 */
import { describe, expect, it } from "vitest";
import { parseDocFile } from "./parse.js";

function withFrontmatter(body: string): string {
  return `---\n${body}\n---\n\n# Env\n`;
}

describe("parseDocFile order", () => {
  it("reads a finite number, including zero and negatives", () => {
    expect(parseDocFile(withFrontmatter("order: 200"), "env.md").order).toBe(
      200,
    );
    expect(parseDocFile(withFrontmatter("order: 0"), "env.md").order).toBe(0);
    expect(parseDocFile(withFrontmatter("order: -5"), "env.md").order).toBe(-5);
  });

  it("is null on a page that declares none", () => {
    expect(parseDocFile("# Env\n", "env.md").order).toBeNull();
    expect(
      parseDocFile(withFrontmatter("name: Env"), "env.md").order,
    ).toBeNull();
  });

  it("rejects anything that is not a finite number", () => {
    // `.nan` and `.inf` are YAML literals, so these are values a real file can
    // hold rather than hypotheticals — and both pass `typeof x === "number"`.
    for (const value of ['"3"', "first", "true", ".nan", ".inf", "-.inf"]) {
      expect(
        parseDocFile(withFrontmatter(`order: ${value}`), "env.md").order,
      ).toBeNull();
    }
  });

  it("leaves the raw value on `frontmatter` whatever it made of it", () => {
    // The parsed key is a convenience over the frontmatter, never a filter on
    // it: the generator round-trips its own keys through that record.
    const parsed = parseDocFile(withFrontmatter("order: first"), "env.md");
    expect(parsed.frontmatter.order).toBe("first");
  });
});
