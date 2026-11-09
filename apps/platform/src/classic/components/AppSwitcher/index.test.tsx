import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
// Vitest has no static-image metadata; image loading is covered by the build.
vi.mock("next/image", () => ({ default: () => null }));
const mocks = vi.hoisted(() => ({ getSwitcherProjects: vi.fn() }));
vi.mock("~/server/projects/showcase", () => ({
  getSwitcherProjects: mocks.getSwitcherProjects,
}));
vi.mock("./provider", () => ({
  useAppSwitcher: () => ({
    visible: true,
    closing: false,
    origin: "center",
    close: vi.fn(),
  }),
}));
vi.mock("~/classic/components/TopNav/NavUserProvider", () => ({
  useNavUser: () => null,
}));
import AppSwitcher from "./index";
import Overlay from "./Overlay";
import type { SwitcherProject } from "~/server/projects/showcase";
const project: SwitcherProject = {
  id: "test",
  name: "DogDays",
  blurb: "Schedule Builder",
  url: "https://dogdays.dev",
  iconKey: "DogDaysIcon",
  colorKey: "cyan-400",
  badge: "Public alpha",
};
afterEach(cleanup);
describe("classic switcher", () => {
  it("reads today's showcase and excludes destinations hidden by the rollback", async () => {
    mocks.getSwitcherProjects.mockResolvedValue([
      project,
      { ...project, id: "hidden", url: "/dashboard/projects/hidden" },
    ]);
    const element = await AppSwitcher();
    expect(element.props).toEqual({ projects: [project] });
    expect(mocks.getSwitcherProjects).toHaveBeenCalled();
  });
  it("renders current showcase fields in the baseline overlay", () => {
    render(<Overlay projects={[project]} />);
    expect(
      screen.getByRole("dialog", { name: "More from DevDogs" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "DogDays" })).toBeTruthy();
    expect(screen.getByText("Schedule Builder")).toBeTruthy();
    expect(screen.getByText("Public alpha")).toBeTruthy();
    expect(screen.queryByText(/Oct 15|Oct 11/)).toBeNull();
  });
});
