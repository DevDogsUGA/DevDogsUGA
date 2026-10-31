/**
 * `buildDocsTree`'s ordering rules, in particular where a FOLDER goes, which no
 * folder declares for itself.
 *
 * Read the first describe block before the rest. A top-level folder's number
 * decides far less than it looks like. This is the tree `getDocsTree` returns
 * — the flat, whole-project shape `generateStaticParams`, the sitemap and
 * `firstPagePath` all walk — not the sidebar's own view, which is
 * `buildDocsSidebarSections`'s fixed Getting-started/Guides/Infrastructure/
 * Reference grouping (see the tests further down this file, and
 * `components/DocsSidebar/Tree.tsx`, which renders THAT rather than this
 * module's raw output). `asSidebar` here transcribes one thing the two shapes
 * still agree on: a top-level folder gathers below every loose page at its own
 * level whatever `order` says, which is why `reference/` was already last in
 * the platform sidebar before this module read `order` at all. The number
 * still decides the order of the folders relative to each other, everything
 * below the top level, and `firstPagePath`, which walks the array rather than
 * either rendering.
 *
 * Where a fixture uses real numbers it says so.
 * `docs/platform/reference/server-actions.md` does carry `order: 1`, and the
 * seven pages in `docs/toolkit/reference/api/` do all carry `order: 200`. They
 * are the cases the rules exist for, and the ones that falsify the tempting
 * simpler versions of them.
 */
import { describe, expect, it } from "vitest";
import {
  buildDocsSidebarSections,
  buildDocsTree,
  findFolder,
  firstPagePath,
  stepPositionOf,
  type DocsSectionId,
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
      page("deploying", "Deploying"),
      page("documentation-system/writing-docs", "Writing Docs"),
      page("reference/routes", "Routes", 2),
      page("reference/supabase", "Supabase", 224),
    ]);

    expect(labels(asSidebar(tree))).toEqual([
      "Contributing",
      "Deploying",
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
      page("appendix", "Appendix"),
      page("getting-started", "Getting Started", 1),
    ]);

    expect(labels(tree)).toEqual([
      "Platform",
      "Getting Started",
      "Appendix",
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
    // because it has nine, Docs Compiler first on 201 because it has one. The
    // smallest ties all three at 201, and the title tiebreak settles it the way
    // it did before folders were placed by their contents at all.
    const tree = buildDocsTree([
      page("reference/api/open-graph", "@devdogsuga/open-graph", 200),
      page("reference/api/devtools", "@devdogsuga/devtools", 200),
      page("reference/api/docs-compiler", "@devdogsuga/docs-compiler", 200),
      page("reference/api/db", "@devdogsuga/db", 200),
      page("reference/api/email", "@devdogsuga/email", 200),
      page("reference/api/env", "@devdogsuga/env", 200),
      page("reference/api/supabase", "@devdogsuga/supabase", 200),
      page("reference/api/devtools/github", "devtools/github", 201),
      page("reference/api/devtools/bws", "devtools/bws", 202),
      page("reference/api/devtools/deploy", "devtools/deploy", 203),
      page("reference/api/devtools/docs", "devtools/docs", 204),
      page("reference/api/devtools/env", "devtools/env", 205),
      page("reference/api/devtools/gh", "devtools/gh", 206),
      page("reference/api/devtools/oauth", "devtools/oauth", 207),
      page("reference/api/devtools/planner", "devtools/planner", 208),
      page("reference/api/devtools/signing-key", "devtools/signing-key", 209),
      page("reference/api/docs-compiler/gen", "docs-compiler/gen", 201),
      page("reference/api/email/runtime", "email/runtime", 201),
      page("reference/api/email/templates", "email/templates", 202),
    ]);

    expect(labels(findFolder(tree, "reference/api")!.children)).toEqual([
      "@devdogsuga/db",
      "@devdogsuga/devtools",
      "@devdogsuga/docs-compiler",
      "@devdogsuga/email",
      "@devdogsuga/env",
      "@devdogsuga/open-graph",
      "@devdogsuga/supabase",
      "Devtools/",
      "Docs Compiler/",
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
      page("reference/api/open-graph", "@devdogsuga/open-graph", 200),
      page("reference/api/supabase", "@devdogsuga/supabase", 200),
      page("reference/components/index", "Components", 100),
    ]);

    expect(firstPagePath(tree)).toBe("reference/components/index");
  });
});

/**
 * The sidebar's own grouping, orthogonal to `buildDocsTree`'s folder-based
 * one: a project's root index is pulled out as "Overview" and everything else
 * buckets into the four fixed sections by the `section` each page's row
 * already carries, in the fixed Getting started / Guides / Infrastructure /
 * Reference order, with an empty section dropped rather than drawn.
 */
function sectionedPage(
  path: string,
  title: string,
  section: DocsSectionId | null,
  order: number | null = null,
) {
  return { path, title, order, section };
}

describe("buildDocsSidebarSections", () => {
  it("pulls the project's root index out as Overview, not into any section", () => {
    const tree = buildDocsSidebarSections([
      sectionedPage("index", "Platform", null),
      sectionedPage("getting-started", "Getting Started", "getting-started"),
    ]);

    expect(tree.overview).toEqual({
      type: "page",
      path: "index",
      title: "Platform",
      order: null,
    });
    expect(tree.sections.map((s) => s.id)).toEqual(["getting-started"]);
  });

  it("orders the sections Getting started, Guides, Infrastructure, Reference regardless of input order", () => {
    const tree = buildDocsSidebarSections([
      sectionedPage("reference/api", "API", "reference"),
      sectionedPage("infrastructure/deploys", "Deploys", "infrastructure"),
      sectionedPage("guides/setup", "Setup", "guides"),
      sectionedPage("getting-started/install", "Install", "getting-started"),
    ]);

    expect(tree.sections.map((s) => s.id)).toEqual([
      "getting-started",
      "guides",
      "infrastructure",
      "reference",
    ]);
  });

  it("drops a section that holds nothing rather than drawing an empty heading", () => {
    const tree = buildDocsSidebarSections([
      sectionedPage("guides/setup", "Setup", "guides"),
    ]);

    expect(tree.sections.map((s) => s.id)).toEqual(["guides"]);
  });

  it("has no Overview for a project with no root index", () => {
    const tree = buildDocsSidebarSections([
      sectionedPage("guides/setup", "Setup", "guides"),
    ]);

    expect(tree.overview).toBeNull();
  });

  it("keeps a section's own ordering rules, same as buildDocsTree", () => {
    // Two guides pages, one declaring an index inside its own subfolder — the
    // index-page-first rule `buildDocsTree` already enforces, unaffected by
    // being routed through a section first.
    const tree = buildDocsSidebarSections([
      sectionedPage("guides/deploying", "Deploying", "guides", 2),
      sectionedPage("guides/contributing", "Contributing", "guides", 1),
    ]);

    // Both pages share the `guides/` path segment, so `buildDocsTree` (which
    // this section's tree is built by) wraps them in one top-level `Guides`
    // folder rather than leaving them loose — same shape it would produce
    // outside a section, and exactly what `SectionHeading` in
    // `components/DocsSidebar/Tree.tsx` unwraps for display.
    const guides = tree.sections.find((s) => s.id === "guides")!;
    const guidesFolder = findFolder(guides.nodes, "guides")!;
    expect(guidesFolder.segment).toBe("guides");
    expect(labels(guidesFolder.children)).toEqual([
      "Contributing",
      "Deploying",
    ]);
  });

  it("treats a page with no declared section as guides, the documented default", () => {
    const tree = buildDocsSidebarSections([
      sectionedPage("random", "Random", null),
    ]);

    // Not Overview — "random" isn't the project's root index — and not
    // dropped either: it lands in Guides, same as the contract's fallback for
    // any page outside reference/.
    expect(tree.overview).toBeNull();
    expect(tree.sections.map((s) => s.id)).toEqual(["guides"]);
  });
});

describe("folder settings", () => {
  const settings = [
    { path: "supabase", name: "Workshop: Supabase", order: 2, steps: false },
    {
      path: "supabase/nextjs",
      name: "Integrate with Next.js",
      order: 2,
      steps: true,
    },
    { path: "cold-start", name: "Cold Start", order: 1, steps: false },
  ];

  const tree = buildDocsTree(
    [
      page("supabase/concepts", "Concepts", 1),
      page("supabase/nextjs/01-read", "Read the Guestbook", 1),
      page("supabase/nextjs/02-sign-in", "Sign In", 2),
      page("cold-start/collaborative-coding", "Collaborative Coding"),
    ],
    settings,
  );

  it("names a folder, rather than title-casing its directory", () => {
    expect(labels(asSidebar(tree))).toEqual([
      "Cold Start/",
      "Workshop: Supabase/",
    ]);
    expect(findFolder(tree, "supabase/nextjs")?.name).toBe(
      "Integrate with Next.js",
    );
  });

  it("places a top-level folder by its settings' order, not its title", () => {
    const reversed = buildDocsTree(
      [page("a/x", "X"), page("b/y", "Y")],
      [
        { path: "a", name: "A", order: 2, steps: false },
        { path: "b", name: "B", order: 1, steps: false },
      ],
    );
    expect(labels(asSidebar(reversed))).toEqual(["B/", "A/"]);
  });

  it("carries steps, and finds a step page's place in its course", () => {
    expect(findFolder(tree, "supabase/nextjs")?.steps).toBe(true);
    const position = stepPositionOf(tree, "supabase/nextjs/02-sign-in");
    expect(position?.index).toBe(1);
    expect(position?.steps.map((step) => step.title)).toEqual([
      "Read the Guestbook",
      "Sign In",
    ]);
  });

  it("puts a page outside any course in none", () => {
    expect(stepPositionOf(tree, "supabase/concepts")).toBeNull();
  });
});
