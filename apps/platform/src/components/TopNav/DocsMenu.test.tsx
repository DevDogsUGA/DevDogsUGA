import { cleanup, render, screen } from "@testing-library/react";
import { NavigationMenu } from "radix-ui";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DocsMenuEntry } from "~/config/docs";
import DocsMenu from "./DocsMenu";

// Static image imports are plain strings under Vitest, which `next/image`
// refuses for want of a width. The mark is what is under test, not the image.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image, which needs a width.
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("./NavShell", () => ({
  CONTRIBUTE_MENU: "contribute",
  DOCS_MENU: "docs",
  useNavPanelRef: () => vi.fn(),
}));

afterEach(cleanup);

beforeAll(() => {
  // Radix's viewport watches its content's size.
  globalThis.ResizeObserver ??= class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

const entries: DocsMenuEntry[] = [
  {
    id: "platform",
    href: "/docs/platform",
    name: "DevDogs Platform",
    description: "Member Portal and Dev Tools",
    mark: { kind: "project", iconKey: "HouseIcon", colorKey: "cyan-400" },
    project: "platform",
  },
  {
    id: "porchlight",
    href: "/docs/porchlight",
    name: "Porchlight",
    description: null,
    mark: { kind: "project", iconKey: "DogPackIcon", colorKey: "purple-500" },
    project: "porchlight",
  },
  {
    id: "oauth",
    href: "/docs/platform/guides/identity",
    name: "Sign in with DevDogs",
    description: "Let members sign in.",
    mark: { kind: "section", icon: "KeyIcon" },
    project: null,
    covers: ["/docs/platform/guides/reporting"],
  },
];

function open(
  props: { activeSlug?: string | null; pathname?: string | null } = {},
) {
  return render(
    <NavigationMenu.Root value="contribute">
      <NavigationMenu.List>
        <DocsMenu
          value="contribute"
          label="Contribute"
          active
          activeSlug={props.activeSlug ?? null}
          pathname={props.pathname ?? null}
          entries={entries}
          className="topnav-link"
        />
      </NavigationMenu.List>
      <NavigationMenu.Viewport />
    </NavigationMenu.Root>,
  );
}

describe("DocsMenu", () => {
  it("labels its trigger and lists a link for every entry, named, described and marked by the entry", () => {
    open();
    expect(screen.getByRole("button", { name: "Contribute" })).toBeTruthy();
    const platform = screen.getByRole("link", { name: /DevDogs Platform/ });
    expect(platform.getAttribute("href")).toBe("/docs/platform");
    expect(platform.textContent).toContain("Member Portal and Dev Tools");
    expect(platform.querySelector("img")).not.toBeNull();
    const porchlight = screen.getByRole("link", { name: /Porchlight/ });
    expect(porchlight.getAttribute("href")).toBe("/docs/porchlight");
    expect(porchlight.querySelector("svg")).not.toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("marks the project being read as current", () => {
    open({ activeSlug: "porchlight" });
    expect(
      screen
        .getByRole("link", { name: /Porchlight/ })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: /DevDogs Platform/ })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks a guide current by its address, and by the folders it spans", () => {
    for (const pathname of [
      "/docs/platform/guides/identity",
      "/docs/platform/guides/identity/consent",
      "/docs/platform/guides/reporting/integrating",
    ]) {
      const { unmount } = open({ activeSlug: "platform", pathname });
      expect(
        screen
          .getByRole("link", { name: /Sign in with DevDogs/ })
          .getAttribute("aria-current"),
      ).toBe("page");
      unmount();
    }
    const { unmount } = open({
      activeSlug: "platform",
      pathname: "/docs/platform/guides/identityx",
    });
    expect(
      screen
        .getByRole("link", { name: /Sign in with DevDogs/ })
        .getAttribute("aria-current"),
    ).toBeNull();
    unmount();
  });
});
