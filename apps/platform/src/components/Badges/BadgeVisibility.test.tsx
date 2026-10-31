import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const calls = vi.hoisted(() => ({
  args: [] as unknown[],
  result: null as unknown,
  toast: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("~/lib/toast", () => ({
  toast: { success: calls.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/badges", () => ({
  setMyBadgeHidden: (input: unknown) => {
    calls.args.push(input);
    return Promise.resolve(calls.result);
  },
}));

const { default: BadgeVisibility } = await import("./BadgeVisibility");

beforeEach(() => {
  calls.result = success(
    { changed: 1 },
    "Badge hidden from your public profile.",
  );
});

afterEach(() => {
  cleanup();
  calls.args = [];
  calls.toast.mockReset();
});

const items = [
  {
    key: "mentor",
    name: "Mentor",
    badgeId: "mentor",
    workshopDefinitionId: null,
    hidden: false,
    count: 2,
  },
  {
    key: "workshop-completed:nextjs",
    name: "Workshop completed: Next.js",
    badgeId: "workshop-completed",
    workshopDefinitionId: "nextjs",
    hidden: true,
    count: 1,
  },
];

describe("BadgeVisibility", () => {
  it("shows one switch per badge, on for the shown and off for the hidden", () => {
    render(<BadgeVisibility items={items} />);
    expect(
      screen
        .getByRole("switch", { name: /Show Mentor/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("switch", { name: /Show Workshop completed: Next.js/ })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getByText(/×2/)).toBeTruthy();
  });

  it("hides a badge through the action and flips the switch", async () => {
    render(<BadgeVisibility items={items} />);
    const toggle = screen.getByRole("switch", { name: /Show Mentor/ });
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("false"),
    );
    expect(calls.args).toEqual([
      { badgeId: "mentor", workshopDefinitionId: null, hidden: true },
    ]);
    expect(calls.toast).toHaveBeenCalledWith(
      "Badge hidden from your public profile.",
    );
  });

  it("keeps the switch where it was and says why when the change is refused", async () => {
    calls.result = failure("That request is invalid.");
    render(<BadgeVisibility items={items} />);
    const toggle = screen.getByRole("switch", { name: /Show Mentor/ });
    await userEvent.click(toggle);
    expect(await screen.findByText("That request is invalid.")).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(calls.toast).not.toHaveBeenCalled();
  });

  it("says so with no badges", () => {
    render(<BadgeVisibility items={[]} />);
    expect(screen.getByText("You have no badges yet.")).toBeTruthy();
  });
});
