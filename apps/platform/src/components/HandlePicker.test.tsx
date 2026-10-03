import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SetHandleOutcome } from "~/server/actions/profileHandle";
import type { HandleChoices } from "~/server/loaders/publicProfiles";

const reply = vi.hoisted(() => {
  const state: {
    outcome: SetHandleOutcome;
    sent: string[];
    fresh: HandleChoices | null;
  } = { outcome: { status: "set", handle: "ada" }, sent: [], fresh: null };
  return state;
});
vi.mock("~/server/actions/profileHandle", () => ({
  default: (handle: string) => {
    reply.sent.push(handle);
    return Promise.resolve(reply.outcome);
  },
}));
vi.mock("~/server/actions/publicProfile", () => ({
  getMyHandleChoices: () => Promise.resolve(reply.fresh),
}));

const { default: HandlePicker } = await import("./HandlePicker");

const choices: HandleChoices = {
  current: null,
  options: [
    { kind: "github", handle: "ada-gh", available: true },
    { kind: "preferred_full", handle: "ada-lovelace", available: false },
    { kind: "suffixed", handle: "ada-2", available: true },
  ],
};

afterEach(() => {
  cleanup();
  reply.sent.length = 0;
});

describe("HandlePicker", () => {
  it("labels each option, shows its URL, and disables taken ones", () => {
    render(<HandlePicker choices={choices} />);
    expect(screen.getByText("GitHub username")).toBeTruthy();
    expect(screen.getByText("/community/@ada-gh")).toBeTruthy();
    expect(screen.getByText("Numbered")).toBeTruthy();
    expect(screen.getByText("taken")).toBeTruthy();
    const taken = screen.getByRole("radio", { name: /Preferred name/ });
    expect((taken as HTMLInputElement).disabled).toBe(true);
  });

  it("says the handle is public, including a connected username", () => {
    render(<HandlePicker choices={choices} />);
    expect(screen.getByText(/Your handle is public/)).toBeTruthy();
    expect(
      screen.getByText(/even if the account is hidden on your profile/),
    ).toBeTruthy();
  });

  it("saves the chosen handle and reports it", async () => {
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<HandlePicker choices={choices} onSaved={onSaved} />);
    await user.click(screen.getByRole("radio", { name: /GitHub username/ }));
    await user.click(screen.getByRole("button", { name: "Save handle" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("ada"));
    expect(reply.sent).toEqual(["ada-gh"]);
    expect(screen.getByText("Your handle is now @ada.")).toBeTruthy();
  });

  it("shows a lost race inline and refreshes the options", async () => {
    reply.outcome = { status: "taken" };
    reply.fresh = {
      current: null,
      options: [{ kind: "github", handle: "ada-gh", available: false }],
    } satisfies HandleChoices;
    const user = userEvent.setup();
    render(<HandlePicker choices={choices} />);
    await user.click(screen.getByRole("radio", { name: /GitHub username/ }));
    await user.click(screen.getByRole("button", { name: "Save handle" }));
    await waitFor(() =>
      expect(
        screen.getByText("That handle was just taken. Pick another."),
      ).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByText("taken")).toBeTruthy());
    expect(screen.queryByText("Numbered")).toBeNull();
  });

  it("shows rate limiting as copy, not an error", async () => {
    reply.outcome = { status: "rate_limited" };
    const user = userEvent.setup();
    render(<HandlePicker choices={choices} />);
    await user.click(screen.getByRole("radio", { name: /Numbered/ }));
    await user.click(screen.getByRole("button", { name: "Save handle" }));
    await waitFor(() =>
      expect(screen.getByText(/changed your handle a lot/)).toBeTruthy(),
    );
  });
});
