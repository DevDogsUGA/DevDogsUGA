import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ args: [] as unknown[] }));
vi.mock("~/server/actions/badges", () => ({
  setMyBadgeHidden: (input: unknown) => {
    calls.args.push(input);
    return Promise.resolve({ changed: 1 });
  },
}));

const { default: BadgeVisibility } = await import("./BadgeVisibility");

afterEach(() => {
  cleanup();
  calls.args = [];
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
  });

  it("says so with no badges", () => {
    render(<BadgeVisibility items={[]} />);
    expect(screen.getByText("You have no badges yet.")).toBeTruthy();
  });
});
