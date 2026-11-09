import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
// Vitest has no static-image metadata; image loading is covered by the build.
vi.mock("next/image", () => ({ default: () => null }));
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
import { SWITCHER_PROJECTS } from "~/classic/config/projects";

afterEach(cleanup);

describe("classic switcher", () => {
  it("lists the old project list's switcher tiles, in order", () => {
    render(<AppSwitcher />);
    const names = SWITCHER_PROJECTS.map((p) => p.title);
    expect(names).toEqual(["DevDogs Platform", "DogDays", "DogPack", "Wuphf"]);
    for (const name of names.slice(1)) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("renders the old tiles and badges", () => {
    render(<Overlay />);
    expect(
      screen.getByRole("dialog", { name: "More from DevDogs" }),
    ).toBeTruthy();
    expect(screen.getByText("Schedule Builder")).toBeTruthy();
    expect(screen.getByText("In Development")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.queryByText(/Oct 15|Oct 11/)).toBeNull();
  });
});
