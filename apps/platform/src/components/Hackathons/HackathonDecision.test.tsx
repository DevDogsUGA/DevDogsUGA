import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: mocks.success } }));
vi.mock("~/server/actions/hackathons", () => ({
  decideHackathonAction: mocks.decide,
}));

const { HackathonDecision } = await import("./HackathonDecision");

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe("HackathonDecision", () => {
  it("approves with the hackathon's id, then toasts and refreshes", async () => {
    mocks.decide.mockResolvedValue({
      ok: true,
      message: "Great Hack approved.",
    });
    const user = userEvent.setup();
    render(<HackathonDecision id="h-1" />);
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.decide).toHaveBeenCalledWith("h-1", "approved");
    expect(mocks.success).toHaveBeenCalledWith("Great Hack approved.");
  });

  it("declines with the hackathon's id", async () => {
    mocks.decide.mockResolvedValue({
      ok: true,
      message: "Great Hack declined.",
    });
    const user = userEvent.setup();
    render(<HackathonDecision id="h-1" />);
    await user.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(mocks.decide).toHaveBeenCalledWith("h-1", "declined"),
    );
  });

  it("disables both buttons while a decision is in flight", async () => {
    let finish!: (value: unknown) => void;
    mocks.decide.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<HackathonDecision id="h-1" />);
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();
    });
    finish({ ok: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled(),
    );
  });

  it("shows a refusal beside the buttons and does not refresh", async () => {
    mocks.decide.mockResolvedValue({
      ok: false,
      message: "That hackathon was already decided.",
    });
    const user = userEvent.setup();
    render(<HackathonDecision id="h-1" />);
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That hackathon was already decided.",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
