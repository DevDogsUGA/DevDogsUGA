import { cleanup, render, screen, within } from "@testing-library/react";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SwitcherProject } from "~/server/projects/showcase";

const mocks = vi.hoisted(() => ({ getSwitcherProjects: vi.fn() }));
vi.mock("~/server/projects/showcase", () => ({
  getSwitcherProjects: mocks.getSwitcherProjects,
}));
// Static image imports are plain strings under Vitest, which `next/image`
// refuses for want of a width. The tiles are what is under test, not the image.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image, which needs a width.
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
vi.mock("./provider", () => ({
  useAppSwitcher: () => ({
    visible: true,
    closing: false,
    origin: "0px 0px",
    close: vi.fn(),
  }),
}));
vi.mock("~/components/TopNav/NavUserProvider", () => ({
  useNavUser: () => null,
}));
vi.mock("~/components/TopNav/SignInButton", () => ({ default: () => null }));

const { default: AppSwitcher } = await import("./index");
const { default: Overlay } = await import("./Overlay");

const tile = (over: Partial<SwitcherProject>): SwitcherProject => ({
  id: "p",
  name: "DogDays",
  blurb: "Schedule Builder",
  url: "https://dogdays.dev",
  iconKey: "DogDaysIcon",
  colorKey: "red-600",
  badge: "Public Alpha",
  ...over,
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("AppSwitcher", () => {
  it("reads the projects on the server and hands them to the overlay", async () => {
    const projects = [tile({})];
    mocks.getSwitcherProjects.mockResolvedValue(projects);
    const element = await AppSwitcher();
    expect(isValidElement(element)).toBe(true);
    expect(element.type).toBe(Overlay);
    expect(element.props).toEqual({ projects });
  });
});

describe("the overlay's Apps grid", () => {
  const apps = () => within(screen.getByText("Apps").parentElement!);

  it("draws one tile per project, in order, each with its name and blurb", () => {
    render(
      <Overlay
        projects={[
          tile({
            id: "a",
            name: "DevDogs Platform",
            blurb: "Member Portal",
            url: "/",
            iconKey: "HouseIcon",
            badge: "You are Here",
          }),
          tile({ id: "b", name: "DogDays" }),
        ]}
      />,
    );
    expect(
      apps()
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["DevDogs Platform", "DogDays"]);
    expect(apps().getByText("Member Portal")).toBeInTheDocument();
    expect(apps().getByText("Schedule Builder")).toBeInTheDocument();
  });

  it("draws the platform as the mascot with its place-marker badge", () => {
    render(
      <Overlay
        projects={[
          tile({
            name: "DevDogs Platform",
            url: "/",
            iconKey: "HouseIcon",
            colorKey: "cyan-400",
            badge: "You are Here",
          }),
        ]}
      />,
    );
    expect(apps().getByText("You are Here")).toBeInTheDocument();
    // The mascot is an <img>, not a glyph.
    const card = apps()
      .getByRole("heading", { name: "DevDogs Platform" })
      .closest("div")!.parentElement!;
    expect(card.querySelector("img")).not.toBeNull();
    expect(card.querySelector("svg")).toBeNull();
  });

  it("draws an app's glyph tinted by its color key", () => {
    render(
      <Overlay
        projects={[
          tile({
            iconKey: "DogPackIcon",
            colorKey: "purple-500",
            name: "DogPack",
          }),
        ]}
      />,
    );
    const glyph = apps()
      .getByRole("heading", { name: "DogPack" })
      .closest("div")!
      .parentElement!.querySelector<HTMLElement>("[aria-hidden]")!;
    expect(glyph.className).toContain("text-purple-500");
    expect(glyph.querySelector("svg")).not.toBeNull();
  });

  it("renders a project with no destination disabled, with no button to press", () => {
    render(
      <Overlay
        projects={[
          tile({ name: "DogPack", url: null, badge: "In Development" }),
        ]}
      />,
    );
    expect(apps().queryByRole("button", { name: "DogPack" })).toBeNull();
    expect(apps().getByText("In Development")).toBeInTheDocument();
    expect(
      apps()
        .getByRole("heading", { name: "DogPack" })
        .closest("[aria-disabled]"),
    ).not.toBeNull();
  });

  it("makes the name of a project with a destination the button that opens it", () => {
    render(<Overlay projects={[tile({})]} />);
    expect(apps().getByRole("button", { name: "DogDays" })).toBeInTheDocument();
  });

  it("never turns an unknown key into a class: it draws the neutral fallback", () => {
    render(
      <Overlay
        projects={[
          tile({
            iconKey: "<svg onload=x>",
            colorKey: "red-600; position:fixed",
          }),
        ]}
      />,
    );
    const glyph = apps()
      .getByRole("heading", { name: "DogDays" })
      .closest("div")!
      .parentElement!.querySelector<HTMLElement>("[aria-hidden]")!;
    expect(glyph.className).toContain("text-foreground");
    expect(glyph.className).not.toContain("position");
  });

  it("draws an empty grid, and the rest of the overlay, with no projects", () => {
    render(<Overlay projects={[]} />);
    expect(apps().queryAllByRole("heading", { level: 3 })).toEqual([]);
    expect(screen.getByText("Links")).toBeInTheDocument();
  });
});
