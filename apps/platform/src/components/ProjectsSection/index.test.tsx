import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShowcaseProject } from "~/server/projects/showcase";

const mocks = vi.hoisted(() => ({ getFeaturedProjects: vi.fn() }));
vi.mock("~/server/projects/showcase", () => ({
  getFeaturedProjects: mocks.getFeaturedProjects,
}));

const { default: ProjectsSection } = await import("./index");

const project = (over: Partial<ShowcaseProject>): ShowcaseProject => ({
  id: "p",
  slug: null,
  name: "DogDays",
  description: "Plan your semester against live UGA registrar data.",
  tagline: "Schedule Builder",
  yearLabel: "2024 – present",
  note: null,
  showcaseLabel: "Public alpha",
  iconKey: "DogDaysIcon",
  colorKey: "red-700",
  contributionMode: "open",
  liveUrl: "https://dogdays.dev",
  liveLabel: "Public Alpha",
  switcherUrl: "https://dogdays.dev",
  tags: ["Next.js", "Supabase"],
  githubUrls: ["https://github.com/DevDogsUGA/DogDays"],
  ...over,
});

async function renderSection() {
  render(await ProjectsSection());
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("ProjectsSection", () => {
  it("draws a card from each open featured project's own fields", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([project({})]);
    await renderSection();

    expect(
      screen.getByRole("heading", { level: 3, name: "DogDays" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Schedule Builder")).toBeInTheDocument();
    expect(
      screen.getByText("Plan your semester against live UGA registrar data."),
    ).toBeInTheDocument();
    expect(screen.getByText("Public alpha")).toBeInTheDocument();
    expect(screen.getByText("Next.js")).toBeInTheDocument();
    expect(screen.getByText("Supabase")).toBeInTheDocument();
  });

  it("keeps the cards in the order the loader gives", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([
      project({ id: "a", name: "DogPack", iconKey: "DogPackIcon" }),
      project({ id: "b", name: "DogDays" }),
    ]);
    await renderSection();
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["DogPack", "DogDays"]);
  });

  it("leaves out a featured project that is closed to contributions", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([
      project({
        id: "a",
        name: "DevDogs Platform",
        contributionMode: "closed",
      }),
      project({ id: "b", name: "Unsaid", contributionMode: null }),
      project({ id: "c", name: "DogDays" }),
    ]);
    await renderSection();
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["DogDays"]);
  });

  it("draws the mark the icon key names, and none for a key without one", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([
      project({ id: "a", name: "DogPack", iconKey: "dogpack" }),
      project({ id: "b", name: "Directory", iconKey: "MagnifyingGlassIcon" }),
    ]);
    await renderSection();
    const [pack, directory] = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.closest<HTMLElement>(".home-proj")!);
    expect(pack!.querySelector(".home-mark.dogpack svg")).not.toBeNull();
    expect(directory!.querySelector(".home-mark")).toBeNull();
  });

  it("leaves out what a project has not filled in rather than drawing it empty", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([
      project({
        tagline: null,
        description: null,
        showcaseLabel: null,
        tags: [],
        iconKey: null,
      }),
    ]);
    await renderSection();
    const card = screen
      .getByRole("heading", { level: 3, name: "DogDays" })
      .closest<HTMLElement>(".home-proj")!;
    expect(card.querySelector(".eyebrow")).toBeNull();
    expect(card.querySelector("p")).toBeNull();
    expect(within(card).queryByText("Public alpha")).toBeNull();
  });

  it("closes up the grid, but keeps the heading and the link, with nothing open to show", async () => {
    mocks.getFeaturedProjects.mockResolvedValue([
      project({ name: "DevDogs Platform", contributionMode: "closed" }),
    ]);
    await renderSection();
    expect(
      screen.getByRole("heading", { name: "Built by students, for students." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All projects/ })).toHaveAttribute(
      "href",
      "/github",
    );
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
});
