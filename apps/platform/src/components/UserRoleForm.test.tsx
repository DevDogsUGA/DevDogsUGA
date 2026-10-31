import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/moderation", () => ({
  updateUserRole: mocks.update,
}));

const { default: UserRoleForm } = await import("./UserRoleForm");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("changes standing with the reason, toasts, and refreshes", async () => {
  const user = userEvent.setup();
  mocks.update.mockResolvedValue(success(undefined, "User suspended."));
  render(<UserRoleForm targetUserId="member-1" currentRole="member" />);
  await user.selectOptions(screen.getByLabelText("Role"), "suspended");
  await user.type(screen.getByLabelText(/Reason/), "harassment");
  await user.click(screen.getByRole("button", { name: "Update role" }));
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(
      "member-1",
      "suspended",
      "harassment",
    ),
  );
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith("User suspended."),
  );
  expect(mocks.refresh).toHaveBeenCalled();
});

it("shows a refusal inline, with no toast and no refresh", async () => {
  const user = userEvent.setup();
  mocks.update.mockResolvedValue(
    failure("You cannot change a user's standing."),
  );
  render(<UserRoleForm targetUserId="member-1" currentRole="member" />);
  await user.click(screen.getByRole("button", { name: "Update role" }));
  expect(
    await screen.findByText("You cannot change a user's standing."),
  ).toBeVisible();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  // No reason typed: the action gets none, not an empty string.
  expect(mocks.update).toHaveBeenCalledWith("member-1", "member", undefined);
});
