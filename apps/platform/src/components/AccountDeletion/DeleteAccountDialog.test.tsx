import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("~/server/actions/accountDeletion", () => ({
  requestAccountDeletion: request,
}));

const { default: DeleteAccountDialog } = await import("./DeleteAccountDialog");

const props = {
  userId: "member-1",
  hasGithub: true,
  hasDiscord: true,
  discordUrl: "https://discord.com/channels/1",
};

beforeEach(() => {
  request.mockReset();
});
afterEach(cleanup);

async function openDialog(extra: Partial<typeof props> = {}) {
  const navigate = vi.fn();
  const user = userEvent.setup();
  render(<DeleteAccountDialog {...props} {...extra} navigate={navigate} />);
  await user.click(screen.getByRole("button", { name: /delete account/i }));
  return { user, navigate };
}

describe("DeleteAccountDialog", () => {
  it("states the window, what goes and what stays, and offers the data first", async () => {
    await openDialog();
    const dialog = screen.getByRole("alertdialog");

    expect(dialog.textContent).toContain("14 days");
    expect(dialog.textContent).toContain("Keep my account");
    expect(dialog.textContent).toContain("without your name");
    expect(dialog.textContent).toContain("credit tied to it is lost");
    expect(dialog.textContent).toContain("badges");
    expect(dialog.textContent).toContain("OAuth apps are deleted");
    expect(dialog.textContent).toContain("Bevy, Engage and UGA");
    expect(dialog.textContent).toContain("best-effort");
    expect(
      screen.getByRole("link", { name: /download my data/i }),
    ).toHaveProperty("href", expect.stringContaining("/account/data"));
  });

  it("links to leave GitHub and Discord for linked accounts only", async () => {
    await openDialog();
    expect(
      screen
        .getByRole("link", { name: /the github organization/i })
        .getAttribute("href"),
    ).toBe("https://github.com/settings/organizations");
    expect(
      screen
        .getByRole("link", { name: /the discord server/i })
        .getAttribute("href"),
    ).toBe("https://discord.com/channels/1");
    cleanup();

    await openDialog({ hasGithub: false, hasDiscord: false });
    expect(
      screen.queryByRole("link", { name: /the github organization/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /the discord server/i }),
    ).toBeNull();
  });

  it("keeps Delete account disabled until the phrase is typed", async () => {
    const { user } = await openDialog();
    const confirm = screen
      .getAllByRole("button", { name: "Delete account" })
      .at(-1)!;
    expect(confirm.hasAttribute("disabled")).toBe(true);

    const input = screen.getByRole("textbox");
    await user.type(input, "delete my acc");
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(request).not.toHaveBeenCalled();

    await user.type(input, "ount");
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("schedules the member's own deletion and goes to the pending page", async () => {
    request.mockResolvedValue({
      ok: true,
      scheduledFor: "2026-11-06T00:00:00Z",
    });
    const { user, navigate } = await openDialog();

    await user.type(screen.getByRole("textbox"), "Delete My Account");
    await user.click(
      screen.getAllByRole("button", { name: "Delete account" }).at(-1)!,
    );

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/account/deletion"),
    );
    expect(request).toHaveBeenCalledWith("member-1");
  });

  it("shows the sole-President refusal and stays put", async () => {
    request.mockResolvedValue({
      ok: false,
      error: "Grant President to someone else first",
    });
    const { user, navigate } = await openDialog();

    await user.type(screen.getByRole("textbox"), "delete my account");
    await user.click(
      screen.getAllByRole("button", { name: "Delete account" }).at(-1)!,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Grant President to someone else first",
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
