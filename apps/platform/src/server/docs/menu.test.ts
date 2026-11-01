// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributeProject } from "./contribute";

const mocks = vi.hoisted(() => ({
  visible: vi.fn(),
  rows: vi.fn(),
}));

vi.mock("./queries", () => ({ getVisibleDocsProjects: mocks.visible }));
vi.mock("./contribute", () => ({
  PLATFORM_SLUG: "platform",
  getContributeProjects: mocks.rows,
}));

const { getContributeMenu, getDocsMenu, getDocsSwitcher } =
  await import("./menu");

const docsProject = (
  slug: string,
  name: string,
  description: string | null = `About ${name}`,
) => ({
  slug,
  name,
  description,
  order: null,
  os: [],
});
const ALL = [
  docsProject("workshops", "Workshops"),
  docsProject(
    "platform",
    "Platform",
    "The site, console, docs, and OAuth server.",
  ),
  docsProject("schedule-builder", "Schedule Builder"),
  docsProject("toolkit", "Shared packages & tooling"),
  docsProject("operations", "Operations"),
];
const PLATFORM_ROW: ContributeProject = {
  slug: "platform",
  name: "DevDogs Platform",
  tagline: "Member Portal and Dev Tools",
  description: "The site you're on.",
  iconKey: "HouseIcon",
  colorKey: "cyan-400",
};
const PUBLISHED: ContributeProject = {
  slug: "porchlight",
  name: "Porchlight",
  tagline: null,
  description: "Find a study spot.",
  iconKey: "DogPackIcon",
  colorKey: "purple-500",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.visible.mockResolvedValue(ALL);
  mocks.rows.mockResolvedValue([PLATFORM_ROW]);
});

describe("the Docs menu", () => {
  it("is the platform-authored docs: Workshops, Shared tooling, Ops, then the guides for building on DevDogs", async () => {
    const menu = await getDocsMenu();
    expect(menu.map((e) => [e.id, e.name, e.href])).toEqual([
      ["workshops", "Workshops", "/docs/workshops"],
      ["toolkit", "Shared packages & tooling", "/docs/toolkit"],
      ["operations", "Operations", "/docs/operations"],
      ["oauth", "Sign in with DevDogs", "/docs/platform/guides/identity"],
      ["moderation", "Moderation", "/docs/platform/guides/moderation"],
      ["sdk", "SDK", "/docs/toolkit/reference/api/sdk"],
    ]);
  });

  it("takes a section's words from its own docs and a guide's from the menu, and marks both as sections", async () => {
    const menu = await getDocsMenu();
    const workshops = menu.find((e) => e.id === "workshops")!;
    expect(workshops).toMatchObject({
      description: "About Workshops",
      project: "workshops",
      mark: { kind: "section", icon: "ChalkboardTeacherIcon", hue: "workshop" },
    });
    const oauth = menu.find((e) => e.id === "oauth")!;
    expect(oauth.project).toBeNull();
    expect(oauth.mark).toMatchObject({ kind: "section", icon: "KeyIcon" });
    expect(oauth.description).toMatch(/DevDogs account/);
    expect(menu.find((e) => e.id === "moderation")?.covers).toEqual([
      "/docs/platform/guides/reporting",
    ]);
  });

  it("never lists a project's docs: those are Contribute's", async () => {
    const ids = (await getDocsMenu()).map((e) => e.id);
    expect(ids).not.toContain("platform");
    expect(ids).not.toContain("schedule-builder");
  });

  it("leaves out a section with nothing live, and a guide whose docs have nothing live", async () => {
    mocks.visible.mockResolvedValue(
      ALL.filter((p) => p.slug !== "workshops" && p.slug !== "platform"),
    );
    const ids = (await getDocsMenu()).map((e) => e.id);
    expect(ids).not.toContain("workshops");
    expect(ids).not.toContain("oauth");
    expect(ids).not.toContain("moderation");
    expect(ids).toContain("sdk");
  });
});

describe("the Contribute menu", () => {
  it("lists the platform first, named and marked by its own project row", async () => {
    const menu = await getContributeMenu();
    expect(menu[0]).toEqual({
      id: "platform",
      href: "/docs/platform",
      name: "DevDogs Platform",
      description: "Member Portal and Dev Tools",
      mark: { kind: "project", iconKey: "HouseIcon", colorKey: "cyan-400" },
      project: "platform",
    });
  });

  it("lists a bundled project with no row under its docs name and a generic mark", async () => {
    const dogdays = (await getContributeMenu()).find(
      (e) => e.id === "schedule-builder",
    );
    expect(dogdays).toMatchObject({
      name: "Schedule Builder",
      description: "About Schedule Builder",
      mark: { kind: "fallback" },
    });
  });

  it("adds each project that has published, from its row, after the bundled ones", async () => {
    mocks.rows.mockResolvedValue([PLATFORM_ROW, PUBLISHED]);
    const menu = await getContributeMenu();
    expect(menu.map((e) => e.id)).toEqual([
      "platform",
      "schedule-builder",
      "porchlight",
    ]);
    expect(menu[2]).toEqual({
      id: "porchlight",
      href: "/docs/porchlight",
      name: "Porchlight",
      description: "Find a study spot.",
      mark: { kind: "project", iconKey: "DogPackIcon", colorKey: "purple-500" },
      project: "porchlight",
    });
  });

  it("keeps the platform first wherever the rows put it", async () => {
    mocks.rows.mockResolvedValue([PUBLISHED, PLATFORM_ROW]);
    expect((await getContributeMenu()).map((e) => e.id)).toEqual([
      "platform",
      "schedule-builder",
      "porchlight",
    ]);
  });

  it("falls back to the docs' own words when the platform has no row (a database without the seed)", async () => {
    mocks.rows.mockResolvedValue([]);
    const platform = (await getContributeMenu())[0]!;
    expect(platform).toMatchObject({
      id: "platform",
      name: "Platform",
      mark: { kind: "fallback" },
    });
  });

  it("does not list the Docs menu's own sections", async () => {
    const ids = (await getContributeMenu()).map((e) => e.id);
    for (const section of ["workshops", "toolkit", "operations"]) {
      expect(ids).not.toContain(section);
    }
  });
});

describe("the docs switcher", () => {
  it("names and marks every bundled project as the menus do", async () => {
    const switcher = await getDocsSwitcher();
    const bySlug = Object.fromEntries(switcher.map((s) => [s.slug, s]));
    expect(bySlug.workshops).toMatchObject({
      name: "Workshops",
      mark: { kind: "section", icon: "ChalkboardTeacherIcon" },
    });
    expect(bySlug.platform).toMatchObject({
      name: "DevDogs Platform",
      description: "Member Portal and Dev Tools",
      mark: { kind: "project", iconKey: "HouseIcon" },
    });
    expect(bySlug["schedule-builder"]).toMatchObject({
      mark: { kind: "fallback" },
    });
    expect(switcher).toHaveLength(ALL.length);
  });

  it("asks for the mode it was given", async () => {
    await getDocsSwitcher("preview");
    expect(mocks.visible).toHaveBeenCalledWith("preview");
  });
});
