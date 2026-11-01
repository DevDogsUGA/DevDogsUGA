import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";
import type { ShowcaseFields } from "~/server/projects/load";

const mocks = vi.hoisted(() => ({ setShowcase: vi.fn() }));

vi.mock("~/server/actions/projectShowcase", () => ({
  setProjectShowcase: mocks.setShowcase,
}));

const { default: ShowcaseDraft } = await import("./ShowcaseDraft");

const PROJECT = "22222222-2222-4222-8222-222222222222";

const fields = (over: Partial<ShowcaseFields> = {}): ShowcaseFields => ({
  featured: false,
  inSwitcher: false,
  displayOrder: 0,
  tagline: "Neighborhood lights",
  yearLabel: null,
  note: null,
  showcaseLabel: null,
  liveUrl: null,
  liveLabel: null,
  switcherUrl: null,
  switcherBlurb: null,
  iconKey: null,
  colorKey: null,
  contributionMode: null,
  ...over,
});

beforeAll(() => {
  // Radix Select opens on a pointer event and scrolls its chosen item into
  // view, neither of which jsdom has.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderDraft = (over: Partial<ShowcaseFields> = {}) =>
  render(<ShowcaseDraft projectId={PROJECT} values={fields(over)} />);
const save = () => screen.getByRole("button", { name: /^Save/ });

describe("ShowcaseDraft", () => {
  it("shows the stored values, with no Save until something changes", () => {
    renderDraft({ featured: true, displayOrder: 3, liveLabel: "Open it" });
    expect(screen.getByRole("heading", { name: "Showcase" })).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLInputElement>("Featured on the homepage")
        .checked,
    ).toBe(true);
    expect(
      screen.getByLabelText<HTMLInputElement>("In the app switcher").checked,
    ).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>(/Display order/).value).toBe(
      "3",
    );
    expect(screen.getByLabelText<HTMLInputElement>(/Tagline/).value).toBe(
      "Neighborhood lights",
    );
    expect(screen.getByLabelText<HTMLInputElement>(/Live label/).value).toBe(
      "Open it",
    );
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("holds edits until Save, then sends every field through setProjectShowcase", async () => {
    const user = userEvent.setup();
    mocks.setShowcase.mockResolvedValue(
      success(undefined, "Showcase updated."),
    );
    renderDraft();
    await user.click(
      screen.getByLabelText<HTMLInputElement>("Featured on the homepage"),
    );
    await user.clear(screen.getByLabelText<HTMLInputElement>(/Display order/));
    await user.type(
      screen.getByLabelText<HTMLInputElement>(/Display order/),
      "-2",
    );
    await user.type(
      screen.getByLabelText<HTMLInputElement>(/Live URL/),
      "https://porchlight.dev",
    );
    expect(mocks.setShowcase).not.toHaveBeenCalled();
    await user.click(save());

    await waitFor(() =>
      expect(mocks.setShowcase).toHaveBeenCalledWith(PROJECT, {
        featured: true,
        inSwitcher: false,
        displayOrder: -2,
        tagline: "Neighborhood lights",
        yearLabel: "",
        note: "",
        showcaseLabel: "",
        liveUrl: "https://porchlight.dev",
        liveLabel: "",
        switcherUrl: "",
        switcherBlurb: "",
        iconKey: null,
        colorKey: null,
        contributionMode: null,
      }),
    );
    await screen.findByText("Showcase updated.");
  });

  it("sends a registry key picked from the icon select", async () => {
    const user = userEvent.setup();
    mocks.setShowcase.mockResolvedValue(success());
    renderDraft();
    await user.click(screen.getByRole("combobox", { name: "Icon" }));
    const list = await screen.findByRole("listbox");
    await user.click(within(list).getByRole("option", { name: "DogPackIcon" }));
    await user.click(save());
    await waitFor(() =>
      expect(mocks.setShowcase).toHaveBeenCalledWith(
        PROJECT,
        expect.objectContaining({ iconKey: "DogPackIcon", colorKey: null }),
      ),
    );
  });

  it("puts the server's message under each field it names and in the save bar", async () => {
    const user = userEvent.setup();
    mocks.setShowcase.mockResolvedValue(
      failure("Check the highlighted fields.", {
        liveUrl: "Use an https:// address, or a path on this site.",
        tagline: "Use 160 characters or fewer.",
      }),
    );
    renderDraft();
    await user.type(
      screen.getByLabelText<HTMLInputElement>(/Live URL/),
      "http://nope",
    );
    await user.click(save());

    const urlError = await screen.findByText(
      "Use an https:// address, or a path on this site.",
      { selector: ".err" },
    );
    expect(urlError.closest("label")?.getAttribute("for")).toBe(
      "prj-show-liveUrl",
    );
    expect(
      screen
        .getByText("Use 160 characters or fewer.", { selector: ".err" })
        .closest("label")
        ?.getAttribute("for"),
    ).toBe("prj-show-tagline");
    expect(
      screen.getAllByText(/Check the highlighted fields/).length,
    ).toBeGreaterThan(0);

    // The messages go once the form changes.
    await user.type(screen.getByLabelText<HTMLInputElement>(/Live URL/), "s");
    expect(screen.queryByText("Use 160 characters or fewer.")).toBeNull();
  });

  it("refuses a display order that is not a whole number before it is sent", async () => {
    const user = userEvent.setup();
    renderDraft();
    await user.clear(screen.getByLabelText<HTMLInputElement>(/Display order/));
    await user.type(
      screen.getByLabelText<HTMLInputElement>(/Display order/),
      "1.5",
    );
    await user.click(save());
    expect(await screen.findByText("Use a whole number.")).toBeTruthy();
    expect(mocks.setShowcase).not.toHaveBeenCalled();
  });
});
