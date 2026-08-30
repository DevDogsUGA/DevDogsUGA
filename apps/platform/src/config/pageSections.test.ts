import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAGE_SECTIONS,
  type PageField,
  type PageSection,
} from "./pageSections";
import { CONSOLE_ITEMS, PROFILE_ITEMS, PUBLIC_LINKS } from "./nav";

/**
 * PAGE_SECTIONS restates anchors and copy that live in page JSX. Rather than
 * drive the pages from the table (which would make them a lot less readable),
 * this reads the sources back and fails on any drift: a renamed anchor, an
 * edited description, a card added without a search entry.
 */

const SOURCES: Record<string, string> = {
  "/account": "app/(site)/account/page.tsx",
  "/tools/oauth": "app/(site)/tools/oauth/page.tsx",
  "/console/permissions": "app/(site)/console/permissions/page.tsx",
  "/console/verification": "app/(site)/console/verification/page.tsx",
};

/** vitest runs with the app package as its root. */
const SRC_DIR = resolve(process.cwd(), "src");

/**
 * Either a card opening (`<ConsoleCard.Root id>` + its `<ConsoleCard.Header
 * title>`) or a `<Field>` opening tag, whichever comes next in the source.
 * Both forms are plain string literals in every page listed above; a prop
 * built from an expression, or a description containing `>`, would need this
 * to become a real TSX parse.
 */
const TOKEN =
  /<ConsoleCard\.Root[^>]*?\sid="([^"]+)"[^>]*>\s*<ConsoleCard\.Header\s+title="([^"]+)"|<Field\b([\s\S]*?)>/g;

function attr(props: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(props)?.[1];
}

function parseSections(source: string): PageSection[] {
  const sections: PageSection[] = [];

  for (const match of source.matchAll(TOKEN)) {
    const [, sectionId, sectionLabel, fieldProps] = match;

    if (sectionId !== undefined && sectionLabel !== undefined) {
      sections.push({ id: sectionId, label: sectionLabel });
      continue;
    }

    const current = sections.at(-1);
    if (!current || fieldProps === undefined) continue;

    const id = attr(fieldProps, "id");
    const label = attr(fieldProps, "label");
    if (id === undefined || label === undefined) continue;

    const field: PageField = { id, label };
    const description = attr(fieldProps, "description");
    if (description !== undefined) field.description = description;

    current.fields = [...(current.fields ?? []), field];
  }

  return sections;
}

/** Drops the `fields: undefined` distinction so empty cards compare equal. */
function normalize(sections: PageSection[]): PageSection[] {
  return sections.map((section) => ({
    ...section,
    fields: section.fields ?? [],
  }));
}

describe("PAGE_SECTIONS", () => {
  it.each(Object.keys(SOURCES))("matches the JSX on %s", (href) => {
    const source = readFileSync(resolve(SRC_DIR, SOURCES[href]!), "utf8");
    const parsed = parseSections(source);

    // A page listed here with nothing parsed means the regex stopped matching,
    // not that the page is empty. Either way it is a failure.
    expect(parsed.length).toBeGreaterThan(0);
    expect(normalize(PAGE_SECTIONS[href] ?? [])).toEqual(normalize(parsed));
  });

  it("only keys pages that exist in the nav manifest", () => {
    const hrefs = new Set(
      [...PUBLIC_LINKS, ...PROFILE_ITEMS, ...CONSOLE_ITEMS].map(
        (item) => item.href,
      ),
    );

    for (const href of Object.keys(PAGE_SECTIONS)) {
      expect(hrefs, `${href} is not a nav item`).toContain(href);
    }
  });

  it("covers every page that has sections", () => {
    expect(Object.keys(PAGE_SECTIONS).sort()).toEqual(
      Object.keys(SOURCES).sort(),
    );
  });
});
