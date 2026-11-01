// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  queries: [] as string[],
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheLife: mocks.cacheLife,
  cacheTag: mocks.cacheTag,
  revalidateTag: mocks.revalidateTag,
}));

/**
 * A query builder that answers every query from `mocks.results`, in the order
 * they are awaited. `orderBy` is the last call in both loaders, so it is the one
 * that settles.
 */
vi.mock("~/server/db", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where"])
    chain[method] = () => chain;
  chain.orderBy = () => Promise.resolve(mocks.results.shift() ?? []);
  return { db: { select: () => chain } };
});

const { getFeaturedProjects, getSwitcherProjects, revalidateShowcase } =
  await import("./showcase");

const platform = {
  id: "p1",
  slug: "platform",
  name: "DevDogs Platform",
  description: "The site you're on.",
  tagline: "Member Portal and Dev Tools",
  yearLabel: "2026 – present",
  note: null,
  showcaseLabel: "Maintenance",
  iconKey: "HouseIcon",
  colorKey: "cyan-400",
  contributionMode: "closed",
  liveUrl: null,
  liveLabel: null,
  switcherUrl: "/",
  tags: ["next"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.results = [];
});

describe("getFeaturedProjects", () => {
  it("is tagged and cached, so a toggle can refresh it", async () => {
    mocks.results = [[]];
    await getFeaturedProjects();
    expect(mocks.cacheTag).toHaveBeenCalledWith("showcase");
    expect(mocks.cacheLife).toHaveBeenCalledOnce();
  });

  it("returns nothing, and reads no links, when nothing is featured", async () => {
    mocks.results = [[], [{ shouldNotBeRead: true }]];
    expect(await getFeaturedProjects()).toEqual([]);
    // The links query was never issued, so its canned answer is still queued.
    expect(mocks.results).toHaveLength(1);
  });

  it("attaches each project's GitHub links and keeps the rows' order", async () => {
    mocks.results = [
      [
        platform,
        { ...platform, id: "p2", name: "DogDays", contributionMode: "open" },
      ],
      [
        { projectId: "p2", owner: "DevDogsUGA", name: "DogDays" },
        { projectId: "p1", owner: "DevDogsUGA", name: "DevDogsUGA" },
        { projectId: "p2", owner: "DevDogsUGA", name: "dogdays-api" },
      ],
    ];
    const featured = await getFeaturedProjects();
    expect(featured.map((project) => project.name)).toEqual([
      "DevDogs Platform",
      "DogDays",
    ]);
    expect(featured[0]!.githubUrls).toEqual([
      "https://github.com/DevDogsUGA/DevDogsUGA",
    ]);
    expect(featured[1]!.githubUrls).toEqual([
      "https://github.com/DevDogsUGA/DogDays",
      "https://github.com/DevDogsUGA/dogdays-api",
    ]);
  });

  it("gives a project with no linked repository an empty list", async () => {
    mocks.results = [[platform], []];
    const [only] = await getFeaturedProjects();
    expect(only!.githubUrls).toEqual([]);
  });

  it("escapes an owner or name before it becomes part of a link", async () => {
    mocks.results = [
      [platform],
      [{ projectId: "p1", owner: "a/b", name: "x?y#z" }],
    ];
    const [only] = await getFeaturedProjects();
    expect(only!.githubUrls).toEqual(["https://github.com/a%2Fb/x%3Fy%23z"]);
  });

  it("reads a contribution mode it does not know as unset", async () => {
    mocks.results = [[{ ...platform, contributionMode: "invite-only" }], []];
    const [only] = await getFeaturedProjects();
    expect(only!.contributionMode).toBeNull();
  });
});

describe("getSwitcherProjects", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "p2",
    name: "DogDays",
    blurb: "Schedule Builder",
    url: "https://dogdays.dev",
    iconKey: "DogDaysIcon",
    colorKey: "red-600",
    showcaseLabel: "Public Alpha",
    ...over,
  });

  it("is tagged and cached, so a toggle can refresh it", async () => {
    mocks.results = [[]];
    await getSwitcherProjects();
    expect(mocks.cacheTag).toHaveBeenCalledWith("showcase");
  });

  it("projects only what a tile needs, with the status as the badge", async () => {
    mocks.results = [[row({})]];
    expect(await getSwitcherProjects()).toEqual([
      {
        id: "p2",
        name: "DogDays",
        blurb: "Schedule Builder",
        url: "https://dogdays.dev",
        iconKey: "DogDaysIcon",
        colorKey: "red-600",
        badge: "Public Alpha",
      },
    ]);
  });

  it("says where you are standing on the tile that leads to this site's front door", async () => {
    mocks.results = [
      [
        row({
          id: "p1",
          name: "DevDogs Platform",
          url: "/",
          showcaseLabel: "Maintenance",
        }),
      ],
    ];
    const [tile] = await getSwitcherProjects();
    expect(tile!.badge).toBe("You are Here");
  });

  it("keeps a missing destination and a missing badge as null", async () => {
    mocks.results = [[row({ url: null, showcaseLabel: null })]];
    const [tile] = await getSwitcherProjects();
    expect(tile!.url).toBeNull();
    expect(tile!.badge).toBeNull();
  });
});

describe("revalidateShowcase", () => {
  it("marks the showcase tag stale-while-revalidate", () => {
    revalidateShowcase();
    expect(mocks.revalidateTag).toHaveBeenCalledWith("showcase", "max");
  });
});
