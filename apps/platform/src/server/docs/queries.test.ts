/**
 * What a reader may see of scheduled docs, and how long that answer may be
 * kept. Every public surface reads through `viewOf`, so these run the whole
 * chain (tree, sidebar, folder entries, page, pager, projects, upcoming) over a
 * small hand-made artifact with the clock pinned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cacheLife } = vi.hoisted(() => ({ cacheLife: vi.fn() }));
vi.mock("next/cache", () => ({ cacheLife }));

const at = (iso: string) => iso;
const OCT5 = at("2026-10-05T22:00:00.000Z");
const OCT12 = at("2026-10-12T22:00:00.000Z");

vi.mock("@devdogsuga/docs", () => {
  const page = (
    path: string,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    path,
    project: path.split("/")[0],
    title: path.split("/").at(-1),
    description: null,
    order: null,
    section: path.endsWith("/index") ? null : "guides",
    headings: [],
    html: `<p>${path}</p>`,
    mountedFrom: null,
    publishAt: null,
    ...extra,
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
      { slug: "later", name: "Later", description: null, order: 2, os: [] },
    ],
    folders: [
      {
        project: "workshops",
        path: "workshops/supabase",
        name: "Workshop: Supabase",
        description: null,
        order: null,
        steps: false,
        publishAt: null,
      },
      {
        project: "workshops",
        path: "workshops/supabase/nextjs",
        name: "Next.js",
        description: null,
        order: null,
        steps: true,
        publishAt: "2026-10-05T22:00:00.000Z",
      },
    ],
    pages: [
      page("workshops/index"),
      page("workshops/supabase/run-locally"),
      page("workshops/supabase/nextjs/01-read", {
        publishAt: "2026-10-05T22:00:00.000Z",
      }),
      page("workshops/supabase/nextjs/02-post", {
        publishAt: "2026-10-12T22:00:00.000Z",
      }),
      page("later/only", { publishAt: "2026-10-12T22:00:00.000Z" }),
    ],
  };
});

import {
  docsPathExists,
  getDocsFolder,
  getDocsPage,
  getDocsPagePaths,
  getDocsSidebarTree,
  getDocsStepNav,
  getDocsTree,
  getDocsUpcoming,
  getVisibleDocsProjects,
} from "./queries";

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

beforeEach(() => {
  vi.useFakeTimers();
  cacheLife.mockClear();
});
afterEach(() => vi.useRealTimers());

const paths = (nodes: Awaited<ReturnType<typeof getDocsTree>>): string[] =>
  nodes.flatMap((node) =>
    node.type === "page" ? [node.path] : paths(node.children),
  );

describe("public reads drop what is scheduled after now", () => {
  it("hides a scheduled folder and everything in it, until its time", async () => {
    setNow("2026-10-01T00:00:00Z");
    expect(paths(await getDocsTree("workshops"))).toEqual([
      "index",
      "supabase/run-locally",
    ]);
    expect(await getDocsFolder("workshops", "supabase/nextjs")).toBeNull();
    expect(
      await getDocsPage("workshops", "supabase/nextjs/01-read"),
    ).toBeNull();
    expect(await getDocsPagePaths("workshops")).not.toContain(
      "supabase/nextjs/01-read",
    );

    setNow("2026-10-05T22:00:00Z");
    expect(
      await getDocsPage("workshops", "supabase/nextjs/01-read"),
    ).toMatchObject({ html: "<p>workshops/supabase/nextjs/01-read</p>" });
    expect(await getDocsFolder("workshops", "supabase/nextjs")).not.toBeNull();
  });

  it("holds a later page back inside a live folder, and the pager skips it", async () => {
    setNow("2026-10-06T00:00:00Z");
    expect(
      await getDocsPage("workshops", "supabase/nextjs/02-post"),
    ).toBeNull();
    const nav = await getDocsStepNav("workshops", "supabase/nextjs/01-read");
    expect(nav?.steps.map((s) => s.path)).toEqual(["supabase/nextjs/01-read"]);

    setNow("2026-10-12T22:00:00Z");
    const later = await getDocsStepNav("workshops", "supabase/nextjs/01-read");
    expect(later?.steps).toHaveLength(2);
  });

  it("keeps scheduled pages out of the sidebar", async () => {
    setNow("2026-10-01T00:00:00Z");
    const { sections } = await getDocsSidebarTree("workshops");
    expect(JSON.stringify(sections)).not.toContain("nextjs");
  });

  it("names what is coming, outermost folder only, and drops a project with nothing live", async () => {
    setNow("2026-10-01T00:00:00Z");
    expect(await getVisibleDocsProjects()).toEqual([
      expect.objectContaining({ slug: "workshops" }),
    ]);
    const upcoming = await getDocsUpcoming();
    expect(upcoming.get("workshops")).toEqual([
      { name: "Workshop: Supabase / Next.js", publishAt: OCT5 },
    ]);
    expect(upcoming.get("later")).toEqual([
      { name: "Later", publishAt: OCT12 },
    ]);

    setNow("2026-10-12T22:00:00Z");
    expect((await getVisibleDocsProjects()).map((p) => p.slug)).toEqual([
      "workshops",
      "later",
    ]);
  });

  it("knows a scheduled path exists, for the link card's 404", () => {
    expect(docsPathExists("workshops", "supabase/nextjs/01-read")).toBe(true);
    expect(docsPathExists("workshops", "supabase/nextjs")).toBe(true);
    expect(docsPathExists("workshops", "nope")).toBe(false);
  });
});

describe("the preview", () => {
  it("lists everything and marks only what is still ahead of now", async () => {
    setNow("2026-10-06T00:00:00Z");
    const tree = await getDocsTree("workshops", "preview");
    expect(paths(tree)).toContain("supabase/nextjs/02-post");
    const post = await getDocsPage(
      "workshops",
      "supabase/nextjs/02-post",
      "preview",
    );
    expect(post?.publishAt).toBe(OCT12);
    // Past its time it is live, so it carries no mark.
    const read = await getDocsPage(
      "workshops",
      "supabase/nextjs/01-read",
      "preview",
    );
    expect(read?.publishAt).toBeNull();
    expect(cacheLife).not.toHaveBeenCalled();
  });
});

describe("cache lifetime", () => {
  it("is until the next reveal, less a minute, with no stale-while-revalidate", async () => {
    setNow("2026-10-05T21:00:00Z");
    await getDocsTree("workshops");
    expect(cacheLife).toHaveBeenCalledWith({
      stale: 30,
      revalidate: 3600 - 60,
      expire: 3600 - 60,
    });
  });

  it("is until deploy for a project with nothing ahead", async () => {
    setNow("2026-11-01T00:00:00Z");
    await getDocsTree("workshops");
    expect(cacheLife).toHaveBeenCalledWith("max");
  });

  it("never asks a project that cannot be empty, so its pages do not borrow another's calendar", async () => {
    setNow("2026-10-01T00:00:00Z");
    // `workshops` has an unscheduled page; `later` does not. Only `later`'s
    // view is read to answer "is it open".
    await getVisibleDocsProjects();
    expect(cacheLife).toHaveBeenCalledTimes(1);
  });
});
