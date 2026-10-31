/**
 * What the bundled docs read as: every page the compiler emitted is there from
 * the day it merges, with nothing held back for a later time. These run the
 * whole chain (tree, sidebar, folder entries, page, pager, projects) over a
 * small hand-made artifact.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@devdogsuga/docs", () => {
  const page = (path: string): Record<string, unknown> => ({
    path,
    project: path.split("/")[0],
    title: path.split("/").at(-1),
    description: null,
    order: null,
    section: path.endsWith("/index") ? null : "guides",
    headings: [],
    html: `<p>${path}</p>`,
    mountedFrom: null,
  });
  return {
    variantGroups: {},
    projects: [
      {
        slug: "workshops",
        name: "Workshops",
        description: null,
        order: 1,
        os: [],
      },
      { slug: "other", name: "Other", description: null, order: 2, os: [] },
    ],
    folders: [
      {
        project: "workshops",
        path: "workshops/supabase",
        name: "Workshop: Supabase",
        description: null,
        order: null,
        steps: false,
      },
      {
        project: "workshops",
        path: "workshops/supabase/nextjs",
        name: "Next.js",
        description: null,
        order: null,
        steps: true,
      },
    ],
    pages: [
      page("workshops/index"),
      page("workshops/supabase/run-locally"),
      page("workshops/supabase/nextjs/01-read"),
      page("workshops/supabase/nextjs/02-post"),
      page("other/only"),
    ],
  };
});

import {
  getDocsFolder,
  getDocsFolderEntries,
  getDocsPage,
  getDocsPagePaths,
  getDocsProjects,
  getDocsSidebarTree,
  getDocsStepNav,
  getDocsTree,
} from "./queries";

const paths = (nodes: Awaited<ReturnType<typeof getDocsTree>>): string[] =>
  nodes.flatMap((node) =>
    node.type === "page" ? [node.path] : paths(node.children),
  );

describe("the bundled docs", () => {
  it("lists every page and folder", async () => {
    expect(paths(await getDocsTree("workshops"))).toEqual([
      "index",
      "supabase/nextjs/01-read",
      "supabase/nextjs/02-post",
      "supabase/run-locally",
    ]);
    expect(await getDocsFolder("workshops", "supabase/nextjs")).not.toBeNull();
    expect(await getDocsPagePaths("workshops")).toContain(
      "supabase/nextjs/02-post",
    );
  });

  it("serves a page's html and its sidebar entry", async () => {
    expect(
      await getDocsPage("workshops", "supabase/nextjs/01-read"),
    ).toMatchObject({ html: "<p>workshops/supabase/nextjs/01-read</p>" });
    expect(await getDocsPage("workshops", "nope")).toBeNull();
    const { sections } = await getDocsSidebarTree("workshops");
    expect(JSON.stringify(sections)).toContain("nextjs");
  });

  it("pages through a course in order", async () => {
    const nav = await getDocsStepNav("workshops", "supabase/nextjs/01-read");
    expect(nav?.steps.map((s) => s.path)).toEqual([
      "supabase/nextjs/01-read",
      "supabase/nextjs/02-post",
    ]);
  });

  it("lists a folder's entries", async () => {
    const folder = (await getDocsFolder("workshops", "supabase/nextjs"))!;
    expect(
      getDocsFolderEntries("workshops", folder).map((entry) => entry.path),
    ).toEqual(["supabase/nextjs/01-read", "supabase/nextjs/02-post"]);
  });

  it("opens every project it has", () => {
    expect(getDocsProjects().map((p) => p.slug)).toEqual([
      "workshops",
      "other",
    ]);
  });
});
