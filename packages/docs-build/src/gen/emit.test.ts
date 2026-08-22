/**
 * The emitter is the one place every extractor's output converges, so a bug
 * here is a bug on several hundred pages at once. Two of these tests guard
 * failures that are invisible until someone reads a rendered page: an
 * unescaped `|` in a union type silently shears a GFM table in half, and an
 * import line printed for a symbol the package does not export is a generator
 * telling a confident lie.
 */
import { describe, expect, it } from "vitest";
import { renderGroupPage, renderRoutesPage, renderSymbol } from "./emit.js";
import type { DocGroup, DocSymbol, RouteEntry } from "./model.js";

const options = {
  sourceBaseUrl: "https://github.com/DevDogsUGA/DevDogsUGA/blob/main",
};

function symbol(overrides: Partial<DocSymbol> = {}): DocSymbol {
  return {
    name: "Button",
    kind: "component",
    importPath: "~/ui/button",
    importStyle: "default",
    summary: null,
    signature: null,
    params: [],
    paramsLabel: null,
    returns: null,
    shape: null,
    tags: [],
    source: { file: "apps/platform/src/ui/button.tsx", line: 12 },
    ...overrides,
  };
}

function group(overrides: Partial<DocGroup> = {}): DocGroup {
  return {
    path: "platform/reference/components/ui",
    title: "UI",
    description: "41 components in apps/platform/src/ui.",
    order: 100,
    symbols: [symbol()],
    ...overrides,
  };
}

describe("renderSymbol", () => {
  it("escapes pipes in a union type so the table survives", () => {
    const page = renderSymbol(
      symbol({
        paramsLabel: "Prop",
        params: [
          {
            name: "variant",
            type: '"primary" | "ghost" | "danger"',
            required: true,
            default: null,
            description: null,
          },
        ],
      }),
      options,
    );

    const row = page.split("\n").find((line) => line.includes("variant"));
    expect(row).toBeDefined();
    expect(row).toContain("\\|");
    // Splitting on unescaped pipes must still yield one row of three cells
    // (with an empty string either side of the leading and trailing pipe).
    expect(row!.split(/(?<!\\)\|/)).toHaveLength(5);
  });

  it("prints a source path instead of an import for an internal symbol", () => {
    const page = renderSymbol(
      symbol({
        name: "normalize",
        kind: "function",
        importStyle: "named",
        importPath: "packages/airtable/src/snapshot",
        tags: ["internal"],
      }),
      options,
    );

    expect(page).not.toContain("import { normalize }");
    expect(page).toContain("internal to the package");
  });

  it("keeps the import line for a public symbol", () => {
    const page = renderSymbol(
      symbol({
        name: "declare",
        kind: "function",
        importStyle: "named",
        importPath: "@devdogsuga/env",
        tags: ["public"],
      }),
      options,
    );

    expect(page).toContain('import { declare } from "@devdogsuga/env";');
  });

  it("renders a Dart symbol as Dart, fence and import alike", () => {
    const page = renderSymbol(
      symbol({
        name: "StudyGroupFinderApp",
        kind: "widget",
        language: "dart",
        importStyle: "named",
        importPath: "package:study_group_finder/main.dart",
        signature: "class StudyGroupFinderApp extends StatelessWidget",
      }),
      options,
    );

    expect(page).toContain("```dart");
    expect(page).not.toContain("```typescript");
    // Dart imports a library, not a binding — the TypeScript form would be a
    // line no reader could paste.
    expect(page).toContain("import 'package:study_group_finder/main.dart';");
    expect(page).not.toContain("import { StudyGroupFinderApp }");
  });

  it("counts inherited props instead of listing them", () => {
    const page = renderSymbol(
      symbol({
        name: "SidebarMenuButton",
        params: [
          {
            name: "isActive",
            type: "boolean",
            required: false,
            default: "false",
            description: null,
          },
        ],
        paramsLabel: "Prop",
        inherited: { count: 294, sources: ["@types/react"] },
      }),
      options,
    );

    expect(page).toContain("| `isActive` |");
    expect(page).toContain("Plus 294 inherited props from `@types/react`.");
  });

  it("emits no props table when every prop is inherited", () => {
    const page = renderSymbol(
      symbol({
        name: "Skeleton",
        params: [],
        paramsLabel: "Prop",
        inherited: { count: 281, sources: ["@types/react"] },
      }),
      options,
    );

    expect(page).not.toContain("| Prop | Type |");
    expect(page).toContain("Plus 281 inherited props");
  });

  it("omits the Default column when nothing has a default", () => {
    const page = renderSymbol(
      symbol({
        paramsLabel: "Prop",
        params: [
          {
            name: "id",
            type: "string",
            required: true,
            default: null,
            description: null,
          },
        ],
      }),
      options,
    );

    expect(page).toContain("| Prop | Type | Required |");
    expect(page).not.toContain("Default");
  });

  it("moves an unreadably wide type into a collapsible", () => {
    const wide = `{ ${"a".repeat(60)}: string; ${"b".repeat(60)}: number }`;
    const page = renderSymbol(
      symbol({
        paramsLabel: "Prop",
        params: [
          {
            name: "config",
            type: wide,
            required: false,
            default: null,
            description: null,
          },
        ],
      }),
      options,
    );

    expect(page).toContain("<details>");
    expect(page).toContain("<summary>Full type for <code>config</code>");
    // The table cell is truncated; the full text lives inside the collapsible.
    expect(page).toContain("…");
    expect(page).toContain(wide);
  });

  it("links to the exact source line", () => {
    const page = renderSymbol(symbol(), options);
    expect(page).toContain(
      "https://github.com/DevDogsUGA/DevDogsUGA/blob/main/apps/platform/src/ui/button.tsx#L12",
    );
  });
});

describe("renderGroupPage", () => {
  it("emits frontmatter, one h1, and says it is generated", () => {
    const page = renderGroupPage(group(), options);

    expect(page.startsWith("---\n")).toBe(true);
    expect(page).toContain('name: "UI"');
    expect(page).toContain("order: 100");
    expect(page).toContain("generated: true");
    // Exactly one h1 — it becomes the first entry of the page's TOC.
    expect(page.match(/^# /gm)).toHaveLength(1);
    expect(page).toContain("**Generated**");
  });

  it("adds kind headings only when a page holds more than one kind", () => {
    const single = renderGroupPage(group(), options);
    expect(single).not.toContain("## Components");

    const mixed = renderGroupPage(
      group({
        symbols: [
          symbol(),
          symbol({ name: "ButtonProps", kind: "type", importStyle: "named" }),
        ],
      }),
      options,
    );
    expect(mixed).toContain("## Components");
    expect(mixed).toContain("## Types");
  });

  it("quotes a description containing a colon so the YAML still parses", () => {
    const page = renderGroupPage(
      group({ description: 'Helpers: parsing, and "quoting".' }),
      options,
    );
    expect(page).toContain(
      'description: "Helpers: parsing, and \\"quoting\\"."',
    );
  });

  it("never leaves a run of blank lines", () => {
    const page = renderGroupPage(
      group({ symbols: [symbol(), symbol({ name: "Card" })] }),
      options,
    );
    expect(page).not.toMatch(/\n{3}/);
  });
});

describe("renderRoutesPage", () => {
  function route(overrides: Partial<RouteEntry> = {}): RouteEntry {
    return {
      url: "/meetings/[id]",
      files: { page: "apps/platform/src/app/(site)/meetings/[id]/page.tsx" },
      methods: [],
      title: "Meeting",
      config: {},
      isApi: false,
      source: {
        file: "apps/platform/src/app/(site)/meetings/[id]/page.tsx",
        line: 1,
      },
      ...overrides,
    };
  }

  it("renders a page table with titles", () => {
    const page = renderRoutesPage(
      [route()],
      {
        title: "Routes",
        description: "Every page the platform serves.",
        order: 2,
        isApi: false,
      },
      options,
    );

    expect(page).toContain("| Route | Title | File |");
    expect(page).toContain("`/meetings/[id]`");
    expect(page).toContain("Meeting");
  });

  it("renders methods instead of titles for API routes", () => {
    const page = renderRoutesPage(
      [
        route({
          url: "/api/webhooks/github",
          methods: ["GET", "POST"],
          isApi: true,
          title: null,
          files: {
            route: "apps/platform/src/app/(api)/api/webhooks/github/route.ts",
          },
        }),
      ],
      {
        title: "API Routes",
        description: "Every handler the platform exposes.",
        order: 3,
        isApi: true,
      },
      options,
    );

    expect(page).toContain("| Route | Methods | File |");
    expect(page).toContain("`GET` `POST`");
  });

  it("adds a segment-config column only when some route sets one", () => {
    const without = renderRoutesPage(
      [route()],
      { title: "Routes", description: "d", order: 2, isApi: false },
      options,
    );
    expect(without).not.toContain("Segment config");

    const with_ = renderRoutesPage(
      [route({ config: { dynamic: '"force-dynamic"' } })],
      { title: "Routes", description: "d", order: 2, isApi: false },
      options,
    );
    expect(with_).toContain("Segment config");
    expect(with_).toContain("dynamic =");
  });
});
