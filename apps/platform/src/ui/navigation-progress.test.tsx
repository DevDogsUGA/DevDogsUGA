import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NavigationProgress from "./navigation-progress";

/**
 * The bar starts on a link click and only clears when `pathname` changes. That
 * makes a cancelled navigation its worst case: nothing changes the pathname, so
 * a bar started for a click that went nowhere creeps toward 85% and stays there
 * for the rest of the session.
 *
 * The account page cancels exactly those clicks to protect unsaved edits (see
 * ~/ui/settings-form), so this is a live pairing, not a hypothetical.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/account" }));

const PROGRESS = '[data-slot="navigation-progress"]';

function renderWithLink() {
  const view = render(
    <>
      <NavigationProgress />
      <a href="/community">Community</a>
    </>,
  );
  return view.getByText("Community");
}

afterEach(() => cleanup());

describe("NavigationProgress", () => {
  it("starts on a plain link click", () => {
    const link = renderWithLink();
    fireEvent.click(link);
    expect(document.querySelector(PROGRESS)).not.toBeNull();
  });

  it("stays away when something already cancelled the navigation", () => {
    const link = renderWithLink();

    // Stand in for the unsaved-changes guard: capture phase, on the document,
    // preventDefault only — exactly what settings-form does.
    const guard = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("click", guard, true);
    try {
      fireEvent.click(link);
    } finally {
      document.removeEventListener("click", guard, true);
    }

    expect(document.querySelector(PROGRESS)).toBeNull();
  });

  it("ignores modified clicks, which open somewhere else entirely", () => {
    const link = renderWithLink();
    fireEvent.click(link, { metaKey: true });
    expect(document.querySelector(PROGRESS)).toBeNull();
  });
});
