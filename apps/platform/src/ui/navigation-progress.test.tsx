import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockNavigation } from "~/lib/navigationGuard";
import NavigationProgress from "./navigation-progress";

/**
 * Next prevents the browser's default action when its App Router claims a
 * `<Link>`. That makes `defaultPrevented` true for both a healthy client
 * navigation and one the account form deliberately blocked. The explicit
 * marker is the distinction this suite protects.
 *
 * The account page cancels exactly those clicks to protect unsaved edits (see
 * ~/ui/settings-form), so this is a live pairing, not a hypothetical.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const PROGRESS = '[data-slot="navigation-progress"]';

function renderWithLink(
  href = "/community",
  onClick?: React.MouseEventHandler<HTMLAnchorElement>,
) {
  const view = render(
    <>
      <NavigationProgress />
      <a href={href} onClick={onClick}>
        Destination
      </a>
    </>,
  );
  return { view, link: view.getByText("Destination") };
}

afterEach(() => cleanup());

beforeEach(() => window.history.replaceState(null, "", "/account"));

describe("NavigationProgress", () => {
  it("starts on a plain link click", () => {
    const { link } = renderWithLink();
    fireEvent.click(link);
    expect(document.querySelector(PROGRESS)).not.toBeNull();
  });

  it("starts when the App Router claims the click with preventDefault", () => {
    const { link } = renderWithLink("/community", (event) =>
      event.preventDefault(),
    );
    fireEvent.click(link);
    expect(document.querySelector(PROGRESS)).not.toBeNull();
  });

  it("stays away when the unsaved-changes guard blocks navigation", () => {
    const { link } = renderWithLink();

    const guard = (event: MouseEvent) => blockNavigation(event);
    document.addEventListener("click", guard, true);
    try {
      fireEvent.click(link);
    } finally {
      document.removeEventListener("click", guard, true);
    }

    expect(document.querySelector(PROGRESS)).toBeNull();
  });

  it("ignores modified clicks, which open somewhere else entirely", () => {
    const { link } = renderWithLink();
    fireEvent.click(link, { metaKey: true });
    expect(document.querySelector(PROGRESS)).toBeNull();
  });

  it("finishes when only the query string changes", () => {
    const { view, link } = renderWithLink("/account?tab=links");
    fireEvent.click(link);
    expect(document.querySelector(PROGRESS)?.getAttribute("data-phase")).toBe(
      "loading",
    );

    window.history.pushState(null, "", "/account?tab=links");
    view.rerender(
      <>
        <NavigationProgress />
        <a href="/account?tab=links">Destination</a>
      </>,
    );

    expect(document.querySelector(PROGRESS)?.getAttribute("data-phase")).toBe(
      "done",
    );
  });
});
