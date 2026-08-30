/**
 * The sidebar's ordering rules, in particular where a FOLDER goes, which no
 * folder declares for itself.
 *
 * Read the first describe block before the rest. A top-level folder's number
 * decides far less than it looks like, because `Nodes` in
 * `components/DocsSidebar/Tree.tsx` renders depth-0 nodes as
 * `[...pages, ...folders]`. Every top-level folder is drawn as a section
 * heading below every loose page whatever `order` says, and `reference/` was
 * already last in the platform sidebar before this module read `order` at all.
 * The number decides the order of the sections relative to each other,
 * everything below the top level, and `firstPagePath`, which walks the array
 * rather than the rendering. `asSidebar` here is that partition transcribed, so
 * the depth-0 tests assert what a reader sees rather than what the array holds.
 *
 * Where a fixture uses real numbers it says so.
 * `docs/platform/reference/server-actions.md` does carry `order: 1`, and the
 * seven pages in `docs/toolkit/reference/api/` do all carry `order: 200`. They
 * are the cases the rules exist for, and the ones that falsify the tempting
 * simpler versions of them.
 */
import { describe, expect, it } from "vitest";
import {
  buildDocsTree,
  findFolder,
  firstPagePath,
  type DocsTreeNode,
} from "./docsTree";

function page(path: string, title: string, order: number | null = null) {
  return { path, title, order };
}

/** Pages by title, folders by name with a trailing slash. */
function labels(nodes: DocsTreeNode[]): string[] {
  return nodes.map((node) =>
    node.type === "page" ? node.title : `${node.name}/`,
  );
}

/**
 * The depth-0 half of `Nodes` in `components/DocsSidebar/Tree.tsx`,
 * transcribed rather than imported: that module is a client component pulling
 * in `next/link` and the icon set, none of which belongs in a unit test of this
 * file. Deeper levels render in array order, so there is nothing to transcribe
 * for them.
 */
function asSidebar(nodes: DocsTreeNode[]): DocsTreeNode[] {
  return [
    ...nodes.filter((node) => node.type === "page"),
    ...nodes.filter((node) => node.type === "folder"),
  ];
}

describe("the top level", () => {
  it("draws sections below the pages whatever order says, without help from order", () => {
    // The whole platform shape in miniature. `reference/` holds a page that
    // claims order 1 ("of everything in reference/, read this first") and the
    // guides beside it claim nothing, so a naive derivation would hoist the
    // generated reference above Getting Started. It does not, and neither would
    // anything else: the partition puts every folder last on its own.
    const tree = buildDocsTree([
      page("index", "Platform"),
      page("getting-started", "Getting Started"),
      page("navigation", "Navigation System"),
      page("reporting-and-feedback", "Reporting and Feedback"),
      page("reference/server-actions", "Server Actions", 1),
      page("reference/routes", "Routes", 2),
      page("reference/supabase", "Supabase", 224),
    ]);

    expect(labels(asSidebar(tree))).toEqual([
      "Platform",
      "Getting Started",
      "Navigation System",
      "Reporting and Feedback",
      "Reference/",
    ]);

    // And nothing was derived for it to be placed by. The numbers inside
    // reference/ are positions among reference/'s own pages; up here they
    // would only be an accident, so the derivation stops.
    expect(findFolder(tree, "reference")!.order).toBeNull();
  });

  it("sorts sections that declare nothing by title", () => {
    // Documentation System holds three unnumbered guides; Reference holds
    // pages numbered 2 and 224. Neither derives anything at this level, so the
    // two sections sort against each other by name. That is also what they did
    // before `order` existed: adding `order` did not quietly reshuffle them.
    const tree = buildDocsTree([
      page("contributing", "Contributing"),
      page("elections", "Elections"),
      page("documentation-system/writing-docs", "Writing Docs"),
      page("reference/routes", "Routes", 2),
      page("reference/supabase", "Supabase", 224),
    ]);

    expect(labels(asSidebar(tree))).toEqual([
      "Contributing",
      "Elections",
      "Documentation System/",
      "Reference/",
    ]);
  });

  it("moves a section when its own index page asks, which is the only way", () => {
    const tree = buildDocsTree([
      page("index", "Platform"),
      page("guides/index", "Guides", 1),
      page("guides/intro", "Intro"),
      page("reference/server-actions", "Server Actions", 1),
    ]);

    // Still below the loose page, because that is the partition's doing and no
    // number overrides it. But ahead of the section that asked for nothing.
    expect(labels(asSidebar(tree))).toEqual([
      "Platform",
      "Guides/",
      "Reference/",
    ]);
  });
});

describe("pages within a folder", () => {
  it("puts the index page first, then order, then title", () => {
    const tree = buildDocsTree([
      page("caching", "Caching"),
      page("index", "Platform"),
      page("airtable-setup", "Airtable Setup"),
      page("getting-started", "Getting Started", 1),
    ]);

    expect(labels(tree)).toEqual([
      "Platform",
      "Getting Started",
      "Airtable Setup",
      "Caching",
    ]);
  });

  it("sorts an unordered page as if it declared the default", () => {
    // 99 and 101 straddle the default, the only way to see that an unordered
    // page is placed rather than appended.
    const tree = buildDocsTree([
      page("zulu", "Zulu", 101),
      page("alpha", "Alpha", 99),
      page("middle", "Middle"),
    ]);

    expect(labels(tree)).toEqual(["Alpha", "Middle", "Zulu"]);
  });

  it("gives the generated reference a reading order instead of an alphabet", () => {
    // This is what the key buys, a level down from where the change was first
    // justified. Alphabetically these are API Routes, Routes, Server Actions;
    // the generator numbers them 1, 2, 3 because a reviewer should meet the
    // server actions first.
    const tree = buildDocsTree([
      page("reference/server-actions", "Server Actions", 1),
      page("reference/routes", "Routes", 2),
      page("reference/api-routes", "API Routes", 3),
      page("reference/supabase", "Supabase", 224),
    ]);

    expect(labels(findFolder(tree, "reference")!.children)).toEqual([
      "Server Actions",
      "Routes",
      "API Routes",
      "Supabase",
    ]);
  });

  it("leads a folder with its index page whatever order that page declares", () => {
    // 118 is where the FOLDER goes; inside the folder the index page is the
    // destination the folder itself redirects to, so it comes first.
    const tree = buildDocsTree([
      page("reference/components/index", "Components", 118),
      page("reference/components/AppSwitcher", "App Switcher", 101),
    ]);

    const components = findFolder(tree, "reference/components");
    expect(labels(components!.children)).toEqual([
      "Components",
      "App Switcher",
    ]);
  });
});

describe("where a folder below the top level goes", () => {
  it("takes the order on its own index page", () => {
    const tree = buildDocsTree([
      page("reference/components/index", "Components", 118),
      page("reference/components/ui", "UI", 122),
      page("reference/api-routes", "API Routes", 3),
      page("reference/supabase", "Supabase", 224),
    ]);

    const reference = findFolder(tree, "reference");
    expect(labels(reference!.children)).toEqual([
      "API Routes",
      "Components/",
      "Supabase",
    ]);
  });

  it("prefers that index page's order to anything its contents declare", () => {
    const tree = buildDocsTree([
      page("reference/api-routes", "API Routes", 3),
      page("reference/guides/index", "Guides", 900),
      page("reference/guides/intro", "Intro", 1),
      page("reference/supabase", "Supabase", 224),
    ]);

    // The 1 inside is about Intro's place among the guides; 900 is the claim
    // about the folder, and it is the one an author wrote on purpose.
    expect(labels(findFolder(tree, "reference")!.children)).toEqual([
      "API Routes",
      "Supabase",
      "Guides/",
    ]);
  });

  it("takes the smallest declared order otherwise, landing beside the page that names it", () => {
    // The generator numbers a folder's pages as a run following the page that
    // names it. In `docs/platform/reference/` the page `server.md` is 203 and
    // `server/*` runs 204 to 222, so the smallest puts `Server/` immediately
    // after `server`, which is the row a reader is looking under.
    const tree = buildDocsTree([
      page("reference/lib", "Lib", 202),
      page("reference/server", "Server", 203),
      page("reference/server/auth", "Auth", 204),
      page("reference/server/teams", "Teams", 222),
      page("reference/src", "Src", 223),
    ]);

    const reference = findFolder(tree, "reference");
    expect(labels(reference!.children)).toEqual([
      "Lib",
      "Server",
      "Server/",
      "Src",
    ]);
    expect(findFolder(tree, "reference/server")!.order).toBe(204);
  });

  it("counts an unnumbered child at the default rather than skipping it", () => {
    // The fixture that separates the two readings of an unnumbered child, and
    // the reason the module picks the one it does. `guides/` holds an
    // unnumbered index page and one page at 300. Counting only the numbers
    // somebody wrote would answer 300 and file the section after Supabase, when
    // the row a reader meets on opening it is the unnumbered index, sorted at
    // 100. And that 300 is Advanced's place INSIDE guides/, so reading it as
    // the folder's own would mean numbering one page last sends the whole
    // section last. Invented numbers: no folder in `docs/` hits this fallback
    // holding an unnumbered child today.
    const tree = buildDocsTree([
      page("reference/api-routes", "API Routes", 3),
      page("reference/guides/index", "Guides"),
      page("reference/guides/advanced", "Advanced", 300),
      page("reference/supabase", "Supabase", 224),
    ]);

    expect(findFolder(tree, "reference/guides")!.order).toBe(100);
    expect(labels(findFolder(tree, "reference")!.children)).toEqual([
      "API Routes",
      "Guides/",
      "Supabase",
    ]);
  });

  it("still prefers a smaller declared number to that default", () => {
    // The mirror of the fixture above, and the worry it settles: filling 100
    // in for the unnumbered index page does not pin the folder at 100, because
    // `Math.min` keeps the smaller of the two and something inside claims 1.
    // This one passes under either reading of an unnumbered child, so it pins
    // the direction of the rule rather than choosing the rule. The test above
    // is the one that chooses.
    const tree = buildDocsTree([
      page("reference/api-routes", "API Routes", 3),
      page("reference/guides/index", "Guides"),
      page("reference/guides/intro", "Intro", 1),
      page("reference/supabase", "Supabase", 224),
    ]);

    expect(findFolder(tree, "reference/guides")!.order).toBe(1);
    expect(labels(findFolder(tree, "reference")!.children)).toEqual([
      "Guides/",
      "API Routes",
      "Supabase",
    ]);
  });

  it("declares nothing when its contents declare nothing", () => {
    const tree = buildDocsTree([
      page("reference/api-routes", "API Routes", 3),
      page("reference/notes/alpha", "Alpha"),
      page("reference/notes/bravo", "Bravo"),
      page("reference/supabase", "Supabase", 224),
    ]);

    // Null, not a number, so it sorts at the default like any other node,
    // between the 3 and the 224. This is the one folder shape that stays null
    // even though an unnumbered child otherwise counts as 100: a folder of
    // pages with no opinion has none of its own to report. Substituting the
    // default would answer 100, which draws in the same place but says
    // something the folder was never told.
    expect(findFolder(tree, "reference/notes")!.order).toBeNull();
    expect(labels(findFolder(tree, "reference")!.children)).toEqual([
      "API Routes",
      "Notes/",
      "Supabase",
    ]);
  });

  it("falls back to title where sibling folders restart at the same number", () => {
    // Every page below is `docs/toolkit/reference/api/` exactly as the
    // generator writes it. Each package is its own target restarting the
    // sequence, so all seven package pages carry `order: 200` and every
    // subfolder under them starts again at 201. There is no one run here for a
    // folder to sit inside. Taking the LARGEST declared number sorted these
    // three by how many pages they happen to hold: Devtools last on 209
    // because it has nine, Docs Build first on 201 because it has one. The
    // smallest ties all three at 201, and the title tiebreak settles it the way
    // it did before folders were placed by their contents at all.
    const tree = buildDocsTree([
      page("reference/api/airtable", "@devdogsuga/airtable", 200),
      page("reference/api/devtools", "@devdogsuga/devtools", 200),
      page("reference/api/docs-build", "@devdogsuga/docs-build", 200),
      page("reference/api/drizzle", "@devdogsuga/drizzle", 200),
      page("reference/api/email", "@devdogsuga/email", 200),
      page("reference/api/env", "@devdogsuga/env", 200),
      page("reference/api/supabase", "@devdogsuga/supabase", 200),
      page("reference/api/devtools/airtable", "devtools/airtable", 201),
      page("reference/api/devtools/bws", "devtools/bws", 202),
      page("reference/api/devtools/deploy", "devtools/deploy", 203),
      page("reference/api/devtools/docs", "devtools/docs", 204),
      page("reference/api/devtools/env", "devtools/env", 205),
      page("reference/api/devtools/gh", "devtools/gh", 206),
      page("reference/api/devtools/oauth", "devtools/oauth", 207),
      page("reference/api/devtools/planner", "devtools/planner", 208),
      page("reference/api/devtools/signing-key", "devtools/signing-key", 209),
      page("reference/api/docs-build/gen", "docs-build/gen", 201),
      page("reference/api/email/runtime", "email/runtime", 201),
      page("reference/api/email/templates", "email/templates", 202),
    ]);

    expect(labels(findFolder(tree, "reference/api")!.children)).toEqual([
      "@devdogsuga/airtable",
      "@devdogsuga/devtools",
      "@devdogsuga/docs-build",
      "@devdogsuga/drizzle",
      "@devdogsuga/email",
      "@devdogsuga/env",
      "@devdogsuga/supabase",
      "Devtools/",
      "Docs Build/",
      "Email/",
    ]);
  });
});

describe("firstPagePath", () => {
  it("walks the array rather than the rendering, so a folder can come first", () => {
    // This is `docs/toolkit`, which has no loose pages at all: `components/`
    // takes 100 from its own index page and `api/` takes 200 from the package
    // pages it holds, so `/docs/toolkit` redirects to the components index
    // rather than the alphabetically first API page. The sidebar's partition
    // never enters into it. `firstPagePath` reads the array.
    const tree = buildDocsTree([
      page("reference/api/airtable", "@devdogsuga/airtable", 200),
      page("reference/api/supabase", "@devdogsuga/supabase", 200),
      page("reference/components/index", "Components", 100),
    ]);

    expect(firstPagePath(tree)).toBe("reference/components/index");
  });
});
