import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShowcaseProject } from "~/server/projects/showcase";

const mocks = vi.hoisted(() => ({ getFeaturedProjects: vi.fn() }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("~/server/projects/showcase", () => ({
  getFeaturedProjects: mocks.getFeaturedProjects,
}));

const { default: Footer } = await import("./Footer");

const project = (over: Partial<ShowcaseProject>): ShowcaseProject => ({
  id: "p",
  slug: null,
  name: "DogDays",
  description: null,
  tagline: null,
  yearLabel: null,
  note: null,
  showcaseLabel: null,
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

async function projectLinks() {
  render(await Footer());
  const nav = screen.getByRole("navigation", { name: "Build" });
  return within(nav)
    .getAllByRole("link")
    .filter(
      (link) =>
        !["Docs", "Changelog", "GitHub organization"].includes(
          link.textContent ?? "",
        ),
    );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("Footer", () => {
  it("lists every featured project, in the loader's order", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([
      project({ id: "a", name: "DevDogs Platform", switcherUrl: "/" }),
      project({ id: "b", name: "DogDays", liveUrl: "https://dogdays.dev" }),
    ]);
    const links = await projectLinks();
    expect(links.map((link) => link.textContent)).toEqual([
      "DevDogs Platform",
      "DogDays",
    ]);
  });

  it("points each at its live site, else its switcher destination, else its first repository", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([
      project({
        id: "a",
        name: "A",
        liveUrl: "https://live.example",
        switcherUrl: "https://switch.example",
        githubUrls: ["https://github.com/DevDogsUGA/A"],
      }),
      project({
        id: "b",
        name: "B",
        switcherUrl: "/",
        githubUrls: ["https://github.com/DevDogsUGA/B"],
      }),
      project({
        id: "c",
        name: "C",
        githubUrls: [
          "https://github.com/DevDogsUGA/C",
          "https://github.com/DevDogsUGA/C2",
        ],
      }),
    ]);
    const links = await projectLinks();
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://live.example",
      "/",
      "https://github.com/DevDogsUGA/C",
    ]);
  });

  it("falls back to the homepage section for a project with no destination, and opens a tab only off-site", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([
      project({ id: "a", name: "Nowhere" }),
      project({ id: "b", name: "Away", liveUrl: "https://away.example" }),
    ]);
    const [nowhere, away] = await projectLinks();
    expect(nowhere).toHaveAttribute("href", "/#projects");
    expect(nowhere).not.toHaveAttribute("target");
    expect(away).toHaveAttribute("target", "_blank");
  });

  it("keeps the heading and the rest of the footer with no featured project", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([]);
    const links = await projectLinks();
    expect(links).toEqual([]);
    expect(
      screen.getByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();
  });
});
