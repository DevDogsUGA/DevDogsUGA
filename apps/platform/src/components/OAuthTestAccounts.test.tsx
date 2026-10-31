import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/testAccounts", () => ({
  addTestAccount: mocks.add,
  updateTestAccount: mocks.update,
  deleteTestAccount: mocks.remove,
}));

const { default: OAuthTestAccounts } = await import("./OAuthTestAccounts");

const ACCOUNTS = [
  { userId: "t1", displayName: "Tess", createdAt: "2026-10-01T00:00:00Z" },
  { userId: "t2", displayName: "Tom", createdAt: "2026-10-02T00:00:00Z" },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("deleting", () => {
  it("removes the row and toasts", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue(success(undefined, "Test account deleted"));
    render(<OAuthTestAccounts initialAccounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "Delete Tess" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(screen.queryByText("Tess")).toBeNull());
    expect(screen.getByText("Tom")).toBeVisible();
    expect(mocks.toast).toHaveBeenCalledWith("Test account deleted");
  });

  it("keeps the row and shows why on it when the delete is refused", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue(failure("Test account not found"));
    render(<OAuthTestAccounts initialAccounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "Delete Tess" }));
    expect(await screen.findByText("Test account not found")).toBeVisible();
    expect(screen.getByText("Tess")).toBeVisible();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

describe("adding", () => {
  async function add(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(
      screen.getByRole("button", { name: /Create a test account/ }),
    );
    await user.type(await screen.findByLabelText("Display name"), name);
    await user.click(screen.getByRole("button", { name: "Add" }));
  }

  it("adds the account to the list, toasts, and closes the dialog", async () => {
    const user = userEvent.setup();
    mocks.add.mockResolvedValue(
      success({ testUserId: "t3", displayName: "Jane" }, "Test account added"),
    );
    render(<OAuthTestAccounts initialAccounts={ACCOUNTS} />);
    await add(user, "Jane");
    expect(await screen.findByText("Jane")).toBeVisible();
    expect((mocks.add.mock.calls[0]![0] as FormData).get("displayName")).toBe(
      "Jane",
    );
    expect(mocks.toast).toHaveBeenCalledWith("Test account added");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the refusal in the dialog and adds nothing", async () => {
    const user = userEvent.setup();
    mocks.add.mockResolvedValue(
      failure("A maximum of 5 test accounts are allowed"),
    );
    render(<OAuthTestAccounts initialAccounts={ACCOUNTS} />);
    await add(user, "Jane");
    expect(
      await screen.findByText("A maximum of 5 test accounts are allowed"),
    ).toBeVisible();
    expect(screen.queryByText("Jane")).toBeNull();
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});

describe("renaming", () => {
  it("sends the account id the action reads, and updates the row", async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue(
      success(
        { testUserId: "t1", displayName: "Tessa" },
        "Test account updated",
      ),
    );
    render(<OAuthTestAccounts initialAccounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "Edit Tess" }));
    const input = await screen.findByLabelText("Display name");
    await user.clear(input);
    await user.type(input, "Tessa");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Tessa")).toBeVisible();
    const data = mocks.update.mock.calls[0]![0] as FormData;
    // The action reads `testUserId`; the form once sent `authUserId`.
    expect(data.get("testUserId")).toBe("t1");
    expect(data.get("displayName")).toBe("Tessa");
    expect(mocks.toast).toHaveBeenCalledWith("Test account updated");
  });

  it("shows a refused rename in the dialog", async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue(failure("Failed to update test user."));
    render(<OAuthTestAccounts initialAccounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "Edit Tess" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Failed to update test user."),
    ).toBeVisible();
    expect(screen.getByText("Tess")).toBeVisible();
  });
});
