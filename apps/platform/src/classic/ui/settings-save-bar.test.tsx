import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SettingsSaveBar from "./settings-save-bar";
import { SettingsFormProvider } from "./settings-form";

/**
 * The bar is written inside the account page's tree but has to paint over the
 * whole document. `<main className="@container">` and PageShell's `isolate`
 * each create a stacking context, which caps the bar's z-40 at "topmost inside
 * PageShell", so <footer>, positioned and later in document order, painted over
 * it and swallowed the bar at the bottom of the page.
 *
 * The portal is the fix, and it is invisible in the rendered markup: the bar
 * looks identical whether or not it escaped. This asserts the escape itself,
 * because deleting the portal would leave every other test passing.
 */

afterEach(() => cleanup());

describe("SettingsSaveBar", () => {
  it("renders outside the tree it is written in", () => {
    // RTL mounts into its own container div, standing in for PageShell here.
    const { container } = render(
      <SettingsFormProvider>
        <SettingsSaveBar />
      </SettingsFormProvider>,
    );

    const save = document.body.querySelector("button");
    expect(save).not.toBeNull();
    expect(container.contains(save)).toBe(false);
  });

  it("keeps the bar out of the tab order until something is dirty", () => {
    render(
      <SettingsFormProvider>
        <SettingsSaveBar />
      </SettingsFormProvider>,
    );

    // No field has registered, so nothing is dirty and the bar is parked
    // off-screen. Leaving it focusable there would put a Save button nobody
    // can see in the middle of the page's tab order.
    const gutter = document.body.querySelector("[inert]");
    expect(gutter).not.toBeNull();
  });
});
