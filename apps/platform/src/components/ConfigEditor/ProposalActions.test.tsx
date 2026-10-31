import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  resetAll: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/configEdits", () => ({
  openConfigPrAction: mocks.open,
  resetAllConfigEditsAction: mocks.resetAll,
}));

const { default: ProposalActions } = await import("./ProposalActions");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("toasts the opened pull request and keeps its link on screen", async () => {
  const user = userEvent.setup();
  mocks.open.mockResolvedValue(
    success({ url: "https://github.com/x/y/pull/1" }, "Opened a pull request."),
  );
  render(<ProposalActions canOpen hasEdits />);
  await user.click(screen.getByRole("button", { name: "Open PR" }));
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith("Opened a pull request."),
  );
  expect(
    await screen.findByRole("link", { name: "View the pull request" }),
  ).toHaveAttribute("href", "https://github.com/x/y/pull/1");
  expect(mocks.refresh).toHaveBeenCalled();
});

it("lists every config failure under the refusal", async () => {
  const user = userEvent.setup();
  mocks.open.mockResolvedValue(
    failure("This proposal does not pass the config checks.", {
      "0": "meeting 2026-10-05: bad time",
      "1": "venue dlw: missing address",
    }),
  );
  render(<ProposalActions canOpen hasEdits />);
  await user.click(screen.getByRole("button", { name: "Open PR" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This proposal does not pass the config checks.",
  );
  expect(screen.getByText("meeting 2026-10-05: bad time")).toBeInTheDocument();
  expect(screen.getByText("venue dlw: missing address")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(mocks.toast).not.toHaveBeenCalled();
});

it("disables Open PR when nothing can be opened", () => {
  render(<ProposalActions canOpen={false} hasEdits={false} />);
  expect(screen.getByRole("button", { name: "Open PR" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Reset all to official" }),
  ).not.toBeInTheDocument();
});

it("resets everything with a toast, or shows the refusal", async () => {
  const user = userEvent.setup();
  mocks.resetAll.mockResolvedValueOnce(
    success(undefined, "Everything is back to official."),
  );
  render(<ProposalActions canOpen hasEdits />);
  await user.click(
    screen.getByRole("button", { name: "Reset all to official" }),
  );
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith("Everything is back to official."),
  );
  mocks.resetAll.mockResolvedValueOnce(failure("Only officers can do that."));
  await user.click(
    screen.getByRole("button", { name: "Reset all to official" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Only officers can do that.",
  );
});
