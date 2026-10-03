import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteeSuggestion } from "~/server/actions/teams";
import InviteForm from "./InviteForm";

/**
 * The invite picker's combobox: debounced search, keyboard navigation, the
 * `@handle` it fills in, and that a stale reply never overwrites a newer one.
 */

const ADA: InviteeSuggestion = {
  handle: "ada",
  label: "Ada Lovelace",
  avatarUrl: null,
};
const GRACE: InviteeSuggestion = {
  handle: "grace",
  label: "@grace",
  avatarUrl: null,
};

function setup(found: InviteeSuggestion[] = [ADA, GRACE]) {
  const searchInvitees = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: found }),
  );
  const inviteToTeam = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: "request-1" }),
  );
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <InviteForm
      teamId="team-1"
      inviteToTeam={inviteToTeam}
      searchInvitees={searchInvitees}
    />,
  );
  return { searchInvitees, inviteToTeam, user };
}

const input = () => screen.getByRole("combobox");

/** Let the debounce fire and the mocked action resolve. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InviteForm combobox", () => {
  it("debounces: one search for a burst of typing, none under two characters", async () => {
    const { searchInvitees, user } = setup();
    await user.type(input(), "a");
    await settle();
    expect(searchInvitees).not.toHaveBeenCalled();

    await user.type(input(), "da");
    await settle();
    expect(searchInvitees).toHaveBeenCalledTimes(1);
    expect(searchInvitees).toHaveBeenCalledWith("team-1", "ada");
  });

  it("shows suggestions with combobox semantics", async () => {
    const { user } = setup();
    expect(input()).toHaveAttribute("aria-expanded", "false");
    await user.type(input(), "ad");
    await settle();

    expect(input()).toHaveAttribute("aria-expanded", "true");
    expect(input()).toHaveAttribute("aria-controls");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Ada Lovelace");
    expect(options[0]).toHaveTextContent("@ada");
    expect(options[1]).toHaveTextContent("@grace");
  });

  it("moves with the arrow keys and picks with Enter, filling @handle", async () => {
    const { inviteToTeam, user } = setup();
    await user.type(input(), "ad");
    await settle();

    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input()).toHaveAttribute("aria-activedescendant", options[0]!.id);
    await user.keyboard("{ArrowDown}{ArrowUp}{ArrowUp}");
    expect(input()).toHaveAttribute("aria-activedescendant", options[1]!.id);

    await user.keyboard("{Enter}");
    expect(input()).toHaveValue("@grace");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    // Picking is not submitting.
    expect(inviteToTeam).not.toHaveBeenCalled();
  });

  it("picks with the mouse", async () => {
    const { user } = setup();
    await user.type(input(), "ad");
    await settle();
    await user.click(screen.getAllByRole("option")[0]!);
    expect(input()).toHaveValue("@ada");
  });

  it("closes on Escape and keeps what was typed", async () => {
    const { user } = setup();
    await user.type(input(), "ad");
    await settle();
    await user.keyboard("{Escape}");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).toHaveValue("ad");
  });

  it("lets Enter submit when no option is highlighted", async () => {
    const { inviteToTeam, user } = setup();
    await user.type(input(), "ada@uga.edu");
    await settle();
    await user.keyboard("{Enter}");
    expect(inviteToTeam).toHaveBeenCalledWith("team-1", "ada@uga.edu");
  });

  it("does not search while an email is being typed", async () => {
    const { searchInvitees, user } = setup();
    await user.type(input(), "ada@uga");
    await settle();
    expect(searchInvitees).not.toHaveBeenCalled();
  });

  it("drops a reply that arrives after a newer keystroke", async () => {
    let resolveFirst: (value: {
      ok: true;
      value: InviteeSuggestion[];
    }) => void = () => undefined;
    const searchInvitees = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce({ ok: true, value: [GRACE] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <InviteForm
        teamId="team-1"
        inviteToTeam={vi.fn()}
        searchInvitees={searchInvitees}
      />,
    );

    await user.type(input(), "ad");
    await settle();
    await user.type(input(), "a");
    await settle();
    expect(screen.getAllByRole("option")).toHaveLength(1);

    await act(async () => {
      resolveFirst({ ok: true, value: [ADA, GRACE] });
      await Promise.resolve();
    });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("@grace");
  });
});
