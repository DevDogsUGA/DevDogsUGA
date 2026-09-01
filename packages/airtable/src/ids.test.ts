import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyDiscoveredIds,
  HEADER_PLACEHOLDER_SECTION,
  HEADER_REAL_SECTION,
} from "./ids.js";

/**
 * The rewriter that turns `todo("slug")` into a real field id.
 *
 * This runs once per base, by a person, against a file that is then committed.
 * No later run catches a mistake here, which is why a string transform this
 * small has tests.
 */

const REGISTRY = join(import.meta.dirname, "registry.ts");

/**
 * A registry-shaped file: the real header, the real `todo` declaration, and a
 * body. Built from the exported constant rather than a copy of it. A fixture
 * that drifts from the text being replaced would pass while the real rewrite
 * silently stopped applying.
 */
function source(body: string): string {
  return `import { field, table } from "./field.js";

/**
 * The field registry.
 *
${HEADER_PLACEHOLDER_SECTION}

export function todo(slug: string): string {
  return \`fldTODO_\${slug}\`;
}

${body}
`;
}

describe("applyDiscoveredIds", () => {
  it("replaces a placeholder call with the id the base assigned", () => {
    const result = applyDiscoveredIds(
      source(`const email = field(todo("members_uga_email"), "UGA Email");`),
      { tables: {}, fields: { fldTODO_members_uga_email: "fldReal123" } },
    );

    expect(result.replaced).toBe(1);
    expect(result.source).toContain('field("fldReal123", "UGA Email")');
    expect(result.source).not.toContain("field(todo(");
  });

  it("leaves already-resolved ids alone rather than warning about them", () => {
    // `discoverIds` maps every real id to itself, so the resolved entries are
    // in the input on every run. Adding ONE table used to print a complaint
    // for each of the six that were already fine.
    const result = applyDiscoveredIds(
      source(`const email = field("fldReal123", "UGA Email");`),
      { tables: {}, fields: { fldReal123: "fldReal123" } },
    );

    expect(result.replaced).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("replaces a resolved id when Airtable recreated the field", () => {
    const result = applyDiscoveredIds(
      source(`const workshop = field("fldOld123", "Workshop");`).replace(
        HEADER_PLACEHOLDER_SECTION,
        HEADER_REAL_SECTION,
      ),
      { tables: {}, fields: { fldOld123: "fldNew456" } },
    );

    expect(result.replaced).toBe(1);
    expect(result.source).toContain('field("fldNew456", "Workshop")');
    expect(result.source).not.toContain("fldOld123");
    expect(result.warnings).toEqual([]);
  });

  it("warns when a placeholder has no call to replace", () => {
    const result = applyDiscoveredIds(source(`const nothing = 1;`), {
      tables: {},
      fields: { fldTODO_ghost: "fldReal999" },
    });

    expect(result.replaced).toBe(0);
    expect(result.warnings).toEqual(['no todo("ghost") call to replace']);
  });

  it("rewrites the header that says the ids are fake", () => {
    const result = applyDiscoveredIds(
      source(`const email = field(todo("members_uga_email"), "UGA Email");`),
      { tables: {}, fields: { fldTODO_members_uga_email: "fldReal123" } },
    );

    expect(result.source).not.toContain("is a PLACEHOLDER");
    expect(result.source).toContain("are real, and are the wire format");
  });

  it("notices a header it can no longer find, once nothing is left to replace", () => {
    // The declaration `function todo(slug: string)` is always present, so the
    // "are there calls left" check has to look for `todo("` specifically.
    const result = applyDiscoveredIds(
      source(`const email = field(todo("a"), "A");`).replace(
        " * ## Field IDs are placeholders until the base exists",
        " * ## Some heading somebody rewrote by hand",
      ),
      { tables: {}, fields: { fldTODO_a: "fldReal1" } },
    );

    expect(result.replaced).toBe(1);
    expect(result.warnings).toEqual([
      expect.stringContaining("no longer matches"),
    ]);
  });

  it("matches the header currently in registry.ts", () => {
    // The transform hard-codes both header paragraphs verbatim. Edit the
    // registry's header by hand and the rewrite silently stops applying, with
    // nothing to notice until a base is scaffolded a year from now. So assert
    // the file is in one of the two states this module knows about, character
    // for character.
    const registry = readFileSync(REGISTRY, "utf8");

    expect(
      registry.includes(HEADER_PLACEHOLDER_SECTION) ||
        registry.includes(HEADER_REAL_SECTION),
    ).toBe(true);
  });
});
