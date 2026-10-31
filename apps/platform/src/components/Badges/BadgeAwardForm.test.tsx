import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  award: vi.fn(),
  withdraw: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: mocks.success } }));
vi.mock("~/server/actions/badges", () => ({
  awardBadge: mocks.award,
  withdrawBadgeAward: mocks.withdraw,
}));
import { BadgeAwardForm, BadgeWithdrawForm } from "./BadgeAwardForm";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("shows refused authorization inline for an award", async () => {
  mocks.award.mockResolvedValue({
    ok: false,
    message: "Only officers can award or withdraw badges.",
  });
  render(
    <BadgeAwardForm
      userId="member"
      badges={[{ id: "helper", name: "Helper" }]}
    />,
  );
  await userEvent.selectOptions(screen.getByLabelText("Badge"), "helper");
  await userEvent.type(screen.getByLabelText(/Citation/), "Helped the team");
  await userEvent.click(screen.getByRole("button", { name: "Award badge" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Only officers can award or withdraw badges.",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  const data: unknown = mocks.award.mock.calls[0]?.[0];
  expect(data).toBeInstanceOf(FormData);
  if (data instanceof FormData) expect(data.get("userId")).toBe("member");
});
it("withdraws with a reason and toasts success", async () => {
  mocks.withdraw.mockResolvedValue({ ok: true, message: "Badge withdrawn." });
  render(<BadgeWithdrawForm awardId="award" />);
  await userEvent.type(
    screen.getByLabelText("Reason for withdrawing"),
    "Mistake",
  );
  await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));
  await waitFor(() =>
    expect(mocks.success).toHaveBeenCalledWith("Badge withdrawn."),
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
