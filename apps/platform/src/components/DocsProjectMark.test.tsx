import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DocsProjectMark from "./DocsProjectMark";

// Static image imports are plain strings under Vitest, which `next/image`
// refuses for want of a width. The mark is what is under test, not the image.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image, which needs a width.
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

/** What `DocsProjectMark` drew, as the one element it returns. */
function drawn(
  mark: Parameters<typeof DocsProjectMark>[0]["mark"],
  size?: "sm" | "lg",
) {
  const { container } = render(<DocsProjectMark mark={mark} size={size} />);
  return container.firstElementChild as HTMLElement;
}

describe("DocsProjectMark", () => {
  it("draws a Project's icon bare, in the color its key names", () => {
    const el = drawn({
      kind: "project",
      iconKey: "DogPackIcon",
      colorKey: "purple-500",
    });
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toContain("text-purple-500");
    expect(el.className).not.toContain("docs-pm");
    expect(el.querySelector("svg")).not.toBeNull();
  });

  it("draws the DevDogs mascot on a tile for the platform's icon", () => {
    const el = drawn({
      kind: "project",
      iconKey: "HouseIcon",
      colorKey: "cyan-400",
    });
    expect(el.className).toBe("docs-pm");
    expect(el.querySelector("img")).not.toBeNull();
  });

  it("sizes the mascot tile and the bare glyph for the landing page", () => {
    expect(
      drawn({ kind: "project", iconKey: "HouseIcon", colorKey: null }, "lg")
        .className,
    ).toBe("docs-pm lg");
    expect(
      drawn({ kind: "project", iconKey: "DogPackIcon", colorKey: null }, "lg")
        .className,
    ).toContain("size-11");
  });

  it("falls back to the generic icon and the neutral color for keys it doesn't know, never drawing a stored string", () => {
    const el = drawn({
      kind: "project",
      iconKey: "<script>",
      colorKey: "url(javascript:alert(1))",
    });
    expect(el.className).toContain("text-foreground");
    expect(el.className).not.toContain("javascript");
    expect(el.querySelector("svg")).not.toBeNull();
    expect(el.innerHTML).not.toContain("script");
  });

  it("draws a docs section as a glyph on a tile in its hue", () => {
    const el = drawn({ kind: "section", icon: "ToolboxIcon", hue: "build" });
    expect(el.className).toContain("docs-pm");
    expect(el.getAttribute("data-kind")).toBe("build");
    expect(el.querySelector("svg")).not.toBeNull();
  });

  it("draws a book for a documented project with no showcase fields", () => {
    const el = drawn({ kind: "fallback" });
    expect(el.className).toContain("docs-pm");
    expect(el.getAttribute("data-kind")).toBeNull();
    expect(el.querySelector("svg")).not.toBeNull();
  });
});
