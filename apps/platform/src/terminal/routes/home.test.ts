// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShowcaseProject } from "~/server/projects/showcase";

// The route table imports loaders that reach the database client.
vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { BASE_URL: "http://localhost:3000" } }));

const mocks = vi.hoisted(() => ({ getFeaturedProjects: vi.fn() }));
vi.mock("~/server/projects/showcase", () => ({
  getFeaturedProjects: mocks.getFeaturedProjects,
}));
vi.mock("~/server/loaders/officers", () => ({
  getCurrentOfficers: () => Promise.resolve([]),
}));
vi.mock("~/components/EventsSection/UpcomingMeetings", () => ({
  nextMeetings: () => Promise.resolve([]),
}));

const { TERMINAL_ROUTES } = await import("../routes");

const project = (over: Partial<ShowcaseProject>): ShowcaseProject => ({
  id: "p",
  slug: null,
  name: "DogDays",
  description: null,
  tagline: "Schedule Builder",
  yearLabel: null,
  note: null,
  showcaseLabel: "Active",
  iconKey: null,
  colorKey: null,
  contributionMode: "open",
  liveUrl: null,
  liveLabel: null,
  switcherUrl: null,
  tags: [],
  githubUrls: [],
  ...over,
});

/** The entries `curl devdogsuga.org` prints under "projects". */
async function projectEntries() {
  const result = await TERMINAL_ROUTES["/"].render({
    params: {},
    search: new URLSearchParams(),
    path: "/",
  });
  if (result.kind !== "page") throw new Error("expected a page");
  // The projects are the first entries block on the page; the changelog's
  // single entry comes after.
  const entries = result.page.body.find(
    (candidate) => candidate.type === "entries",
  );
  if (entries?.type !== "entries") throw new Error("expected entries");
  return entries;
}

beforeEach(() => vi.clearAllMocks());

describe("curl devdogsuga.org, projects", () => {
  it("prints each featured project: name, tagline, status and where to find it", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([
      project({
        name: "DevDogs Platform",
        tagline: "Member Portal and Dev Tools",
        showcaseLabel: "Maintenance",
        contributionMode: "closed",
      }),
      project({
        id: "q",
        liveUrl: "https://dogdays.dev",
        githubUrls: ["https://github.com/DevDogsUGA/DogDays"],
      }),
      project({
        id: "r",
        name: "DogPack",
        showcaseLabel: null,
        tagline: null,
        githubUrls: ["https://github.com/DevDogsUGA/DogPack"],
      }),
    ]);
    const { items } = await projectEntries();
    expect(items).toEqual([
      {
        label: "DevDogs Platform",
        meta: "Member Portal and Dev Tools",
        chip: expect.objectContaining({ label: "Maintenance" }) as unknown,
        text: "Built by the officer team.",
      },
      {
        label: "DogDays",
        meta: "Schedule Builder",
        chip: expect.objectContaining({ label: "Active" }) as unknown,
        text: "https://dogdays.dev",
      },
      {
        label: "DogPack",
        meta: undefined,
        chip: undefined,
        text: "https://github.com/DevDogsUGA/DogPack",
      },
    ]);
  });

  it("prints the section without entries rather than failing when the read does", async () => {
    mocks.getFeaturedProjects.mockRejectedValue(new Error("db down"));
    expect((await projectEntries()).items).toEqual([]);
  });
});
