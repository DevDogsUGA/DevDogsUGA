/**
 * The emitter is the one place every extractor's output converges, so a bug
 * here is a bug on several hundred pages at once. Three of these tests guard
 * failures that are invisible until someone reads a rendered page: an
 * unescaped `|` in a union type silently shears a GFM table in half, an
 * unescaped `<` in a doc comment opens an element that swallows everything
 * after it, and an import line printed for a symbol the package does not
 * export is a generator telling a confident lie.
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

  it("escapes a raw tag in a doc comment, keeping its own collapsible", () => {
    const page = renderSymbol(
      symbol({
        name: "InlineTableOfContents",
        // The comment that found this: rendered as markup, the `<details>`
        // ended the paragraph and opened a disclosure widget nothing closed,
        // and the ten symbols after it on the page rendered inside it.
        summary:
          "The same contents folded up above the article. Built from the " +
          "Collapsible the sidebar's folders use rather than a bare " +
          "<details>, and hidden from `lg`.",
        paramsLabel: "Prop",
        params: [
          {
            name: "items",
            type: `{ ${"deeplyNestedHeading".repeat(5)}: string }`,
            required: true,
            default: null,
            description: null,
          },
        ],
      }),
      options,
    );

    expect(page).toContain("rather than a bare &lt;details>");
    // The generator's own collapsible is markup and stays markup, so the page
    // still opens exactly as many disclosure widgets as it closes.
    expect(page.match(/<details>/g)).toHaveLength(1);
    expect(page.match(/<\/details>/g)).toHaveLength(1);
    // The code span in the same sentence is still a code span.
    expect(page).toContain("hidden from `lg`");
  });

  it("leaves a tag inside a code span alone", () => {
    const page = renderSymbol(
      symbol({
        name: "declare",
        kind: "function",
        // An entity is not decoded inside a code span, so escaping this one
        // would print the literal text `&lt;password>` where the author wrote
        // a placeholder — and a code span cannot open an element anyway.
        summary:
          "Its example is a shape, never a value: " +
          "`postgresql://postgres:<password>@<host>:5432/postgres`.",
      }),
      options,
    );

    expect(page).toContain(
      "`postgresql://postgres:<password>@<host>:5432/postgres`",
    );
    expect(page).not.toContain("&lt;");
  });

  it("leaves generics alone inside a multi-line fenced summary", () => {
    const page = renderSymbol(
      symbol({
        name: "GroupList",
        kind: "widget",
        language: "dart",
        importPath: "package:study_group_finder/groups/group_list.dart",
        // The shape a dartdoc comment arrives in. `_prose` in
        // apps/study-group-finder/tool/docs_extract.dart heals a paragraph's
        // hard wraps onto one line but leaves a fence on its own lines, and
        // gen/dart.ts hands that over uncollapsed — so unlike a TypeScript
        // summary, this one still has newlines in it when it gets here.
        summary: [
          "A scrollable column of study-group cards.",
          "",
          "```dart",
          "final items = <Widget>[];",
          "final byId = <String, GroupCard>{};",
          "```",
          "",
          "Prefer this over a bare <details> block in the prose.",
        ].join("\n"),
      }),
      options,
    );

    // Escaped, these two lines would show the reader `&lt;Widget>` in the
    // middle of a sample they are meant to copy — and a Flutter sample is
    // generics all the way down.
    expect(page).toContain("final items = <Widget>[];");
    expect(page).toContain("final byId = <String, GroupCard>{};");
    // The sentence after the fence is prose again, and still escaped.
    expect(page).toContain("bare &lt;details> block");
  });

  it("leaves generics alone inside a four-space-indented fence", () => {
    const page = renderSymbol(
      symbol({
        name: "GroupList",
        kind: "widget",
        language: "dart",
        // A dartdoc fence written two list levels deep: `///` and its one
        // conventional space come off and four spaces of markdown indent stay,
        // which puts the fence past the three `fenceRun` allows. Indented that
        // far it is code under either reading — an indented block, or a fence
        // inside the list item — so nothing in it is escaped.
        summary: [
          "- Nested, and a <span> here is prose:",
          "",
          "- deeper",
          "",
          "    ```dart",
          "    final deep = <int>[1, 2];",
          "    ```",
          "",
          "Then <b>prose</b> again.",
        ].join("\n"),
      }),
      options,
    );

    expect(page).toContain("    final deep = <int>[1, 2];");
    // The run has to start where the indent does and stop where it stops:
    // everything either side of it is prose, and prose is escaped.
    expect(page).toContain("a &lt;span> here is prose:");
    expect(page).toContain("Then &lt;b>prose&lt;/b> again.");
  });

  it("escapes prose after a fenced sample that collapsed onto one line", () => {
    const page = renderSymbol(
      symbol({
        name: "correlatedCount",
        kind: "function",
        // The shape a TypeScript doc comment arrives in, and the reason this
        // path needs its own test even though the Dart one above looks like
        // it covers the same ground. `collapseParagraphs` (gen/program.ts)
        // replaces every newline inside a paragraph with a space — fences
        // included, unlike the Dart extractor, which leaves them on their own
        // lines — so a sample written across four lines reaches the emitter as
        // the single line below.
        //
        // CommonMark reads that line as a paragraph holding one code span,
        // because a backtick fence's info string may not contain a backtick;
        // rendered through remark-gfm and rehype-raw it comes back as
        // `<p><code>ts const x = a &#x3C; b; </code></p>`. Read instead as an
        // opening fence — which is what this emitter did until `opensFence` —
        // it is a fence nothing closes, so everything after it is code and
        // nothing after it is escaped. Rendering the page it produced showed
        // the `<details>` below opening a real disclosure element whose
        // `</details>` landed after the source link, with every line between
        // the two swallowed inside it.
        summary: [
          "Wraps a subquery so it can sit in a `select`.",
          "",
          "```ts const x = a < b; ```",
          "",
          "Prefer this over a bare <details> block in the prose.",
        ].join("\n"),
      }),
      options,
    );

    expect(page).toContain("bare &lt;details> block");
    // The collapsed line is a code span to the renderer, so its `<` is inert
    // and stays as the author typed it — escaping there would put `a &lt; b`
    // in the middle of the sample the reader came for.
    expect(page).toContain("```ts const x = a < b; ```");
  });

  it("escapes a raw tag in a prop description too", () => {
    const page = renderSymbol(
      symbol({
        paramsLabel: "Prop",
        params: [
          {
            name: "as",
            type: "string",
            required: false,
            default: '"div"',
            description: "The element to render. Defaults to <div>.",
          },
        ],
      }),
      options,
    );

    const row = page.split("\n").find((line) => line.includes("`as`"));
    expect(row).toContain("Defaults to &lt;div>.");
  });

  it("keeps a code span in a prop description and escapes the tag beside it", () => {
    const page = renderSymbol(
      symbol({
        kind: "widget",
        language: "dart",
        paramsLabel: "Prop",
        params: [
          {
            name: "children",
            type: "List<Widget>",
            required: true,
            default: null,
            description:
              "The cards to show. Pass a `<Widget>[]` when there are none, " +
              "never <null>.",
          },
        ],
      }),
      options,
    );

    const row = page.split("\n").find((line) => line.includes("`children`"));
    expect(row).toContain("`<Widget>[]`");
    expect(row).toContain("never &lt;null>");
  });

  it("escapes a flattened fence's tag even where a code span would have held it", () => {
    const page = renderSymbol(
      symbol({
        kind: "widget",
        language: "dart",
        paramsLabel: "Prop",
        params: [
          {
            name: "children",
            type: "List<Widget>",
            required: true,
            default: null,
            // A GFM row is one line, so `cell` flattens this fence whatever
            // else happens. What is left is where `escapeLine`'s pairing rule
            // and CommonMark's part company, and the row below is the case
            // that measures the gap rather than the case that justifies it.
            //
            // CommonMark pairs the leading ``` with the trailing ``` and reads
            // everything between as one code span, stray backtick included, so
            // this `<Widget>` is inert either way: rendered through remark-gfm
            // and rehype-raw, the row with no escaping at all comes back as
            // `<td>Example: <code>dart final items = &#x3C;Widget>[]; …</code></td>`
            // — inside the code span, no element opened. `escapeLine` cannot
            // see that span, because its regex closes a run with an equal run
            // and the text between the two may not contain a backtick, so the
            // lone one here blocks the match and the `<` is escaped. Rendered,
            // the escaped row gives `&#x26;lt;Widget>` inside the same code
            // span — a literal `&lt;` shown to the reader.
            //
            // That cost is the price of the rule, not a bug the rule catches,
            // and the test stands to pin the price. What the rule is for is
            // the flattening that leaves a run genuinely unpaired — a fence
            // whose closing delimiter never reached the description — and that
            // case was rendered too: the row
            // `| … | Example: ```dart final items = <Widget>[]; |` comes back
            // as `<td>Example: ```dart final items = <widget>[];</widget></td>`,
            // a real element opened inside the table cell. Escaping is the
            // only thing standing between that tag and the page.
            description: [
              "Example:",
              "",
              "```dart",
              "final items = <Widget>[]; // a ` here",
              "```",
            ].join("\n"),
          },
        ],
      }),
      options,
    );

    const row = page.split("\n").find((line) => line.includes("`children`"));
    expect(row).toContain("&lt;Widget>[]");
    expect(row).not.toContain("<Widget>[]");
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

  it("escapes a title that reads as a tag", () => {
    const page = renderRoutesPage(
      [route({ title: "Teams <beta>" })],
      { title: "Routes", description: "d", order: 2, isApi: false },
      options,
    );

    expect(page).toContain("Teams &lt;beta>");
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
