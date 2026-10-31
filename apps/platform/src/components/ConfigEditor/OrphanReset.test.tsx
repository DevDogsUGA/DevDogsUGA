import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({ reset: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("~/server/actions/configEdits", () => ({
  resetConfigEditAction: mocks.reset,
}));

const { default: OrphanReset } = await import("./OrphanReset");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("resets the orphaned edit by collection and key, then refreshes", async () => {
  const user = userEvent.setup();
  mocks.reset.mockResolvedValue(success(undefined, "Reset to official."));
  render(<OrphanReset collection="meeting" editKey="2020-01-01" />);
  await user.click(screen.getByRole("button", { name: "Reset" }));
  await waitFor(() =>
    expect(mocks.reset).toHaveBeenCalledExactlyOnceWith(
      "meeting",
      "2020-01-01",
    ),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
});

it("shows a refusal beside the button", async () => {
  const user = userEvent.setup();
  mocks.reset.mockResolvedValue(failure("Only officers can propose changes."));
  render(<OrphanReset collection="meeting" editKey="2020-01-01" />);
  await user.click(screen.getByRole("button", { name: "Reset" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Only officers can propose changes.",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});
