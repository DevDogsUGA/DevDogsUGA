import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  request: vi.fn(),
  cancel: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: actions.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/accountDeletion", () => ({
  requestAccountDeletion: actions.request,
  cancelMemberDeletion: actions.cancel,
}));

const { default: ScheduleDeletionPanel } =
  await import("./ScheduleDeletionPanel");

beforeEach(() => {
  actions.request.mockReset();
  actions.cancel.mockReset();
  actions.refresh.mockReset();
  actions.toast.mockReset();
});
afterEach(cleanup);

describe("ScheduleDeletionPanel", () => {
  it("needs the typed word, then schedules with the reason", async () => {
    actions.request.mockResolvedValue({
      ok: true,
      data: { scheduledFor: "x" },
      message: "Account scheduled for deletion.",
    });
    const user = userEvent.setup();
    render(
      <ScheduleDeletionPanel
        targetUserId="member-1"
        memberName="Sam"
        pending={null}
      />,
    );
    const submit = screen.getByRole("button", { name: "Schedule deletion" });
    expect(submit.hasAttribute("disabled")).toBe(true);

    await user.type(screen.getByLabelText(/reason/i), "requested by email");
    await user.type(screen.getByLabelText(/type "delete"/i), "delete");
    await user.click(submit);

    await waitFor(() => expect(actions.refresh).toHaveBeenCalled());
    expect(actions.request).toHaveBeenCalledWith(
      "member-1",
      "requested by email",
    );
    expect(actions.toast).toHaveBeenCalledWith(
      "Account scheduled for deletion.",
    );
    expect(screen.getByLabelText(/reason/i)).toHaveValue("");
  });

  it("shows a refusal from the server", async () => {
    actions.request.mockResolvedValue({
      ok: false,
      message: "Grant President to someone else first",
    });
    const user = userEvent.setup();
    render(
      <ScheduleDeletionPanel
        targetUserId="member-1"
        memberName="Sam"
        pending={null}
      />,
    );
    await user.type(screen.getByLabelText(/type "delete"/i), "delete");
    await user.click(screen.getByRole("button", { name: "Schedule deletion" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Grant President",
    );
    expect(actions.refresh).not.toHaveBeenCalled();
    expect(actions.toast).not.toHaveBeenCalled();
  });

  it("shows a pending deletion and lets an officer cancel it", async () => {
    actions.cancel.mockResolvedValue({
      ok: true,
      message: "Deletion cancelled.",
    });
    const user = userEvent.setup();
    render(
      <ScheduleDeletionPanel
        targetUserId="member-1"
        memberName="Sam"
        pending={{
          date: "Friday, November 6, 2026",
          started: false,
          requestedBy: "member",
        }}
      />,
    );
    expect(screen.getByText(/Friday, November 6, 2026/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Schedule deletion" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Cancel deletion" }));
    await waitFor(() =>
      expect(actions.cancel).toHaveBeenCalledWith("member-1"),
    );
    await waitFor(() =>
      expect(actions.toast).toHaveBeenCalledWith("Deletion cancelled."),
    );
  });

  it("shows why a cancel was refused, beside the button", async () => {
    actions.cancel.mockResolvedValue({
      ok: false,
      message: "There is no pending deletion to cancel, or it has started.",
    });
    const user = userEvent.setup();
    render(
      <ScheduleDeletionPanel
        targetUserId="member-1"
        memberName="Sam"
        pending={{
          date: "Friday, November 6, 2026",
          started: false,
          requestedBy: "member",
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel deletion" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "There is no pending deletion",
    );
    expect(actions.toast).not.toHaveBeenCalled();
  });

  it("offers no cancel once the job has started", () => {
    render(
      <ScheduleDeletionPanel
        targetUserId="member-1"
        memberName="Sam"
        pending={{
          date: "Friday, November 6, 2026",
          started: true,
          requestedBy: "officer",
        }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Cancel deletion" }),
    ).toBeNull();
  });
});
