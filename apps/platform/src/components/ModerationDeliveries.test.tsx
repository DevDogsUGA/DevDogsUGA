import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  resend: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/moderationDeliveries", () => ({
  resendDelivery: mocks.resend,
}));

const { default: ModerationDeliveries } =
  await import("./ModerationDeliveries");

const DELIVERIES = [
  {
    id: "d-failed",
    type: "user.suspend",
    status: "failed" as const,
    attempts: 5,
    lastError: "502",
    appName: "DogPack",
  },
  {
    id: "d-ok",
    type: "content.hide",
    status: "delivered" as const,
    attempts: 1,
    lastError: null,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function resend(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Resend/ }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Resend",
    }),
  );
}

it("offers Resend only on a delivery that is not delivered", () => {
  render(<ModerationDeliveries deliveries={DELIVERIES} />);
  expect(screen.getAllByRole("button", { name: /Resend/ })).toHaveLength(1);
});

it("resends after a confirm, with a toast", async () => {
  const user = userEvent.setup();
  mocks.resend.mockResolvedValue(success(undefined, "Queued to send again."));
  render(<ModerationDeliveries deliveries={DELIVERIES} />);
  await resend(user);
  await waitFor(() =>
    expect(mocks.resend).toHaveBeenCalledExactlyOnceWith("d-failed"),
  );
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith("Queued to send again."),
  );
  expect(mocks.refresh).toHaveBeenCalled();
});

it("shows a refused resend beside the delivery", async () => {
  const user = userEvent.setup();
  mocks.resend.mockResolvedValue(
    failure("You cannot resend moderation deliveries."),
  );
  render(<ModerationDeliveries deliveries={DELIVERIES} />);
  await resend(user);
  expect(
    await screen.findByText("You cannot resend moderation deliveries."),
  ).toBeVisible();
  expect(mocks.toast).not.toHaveBeenCalled();
});
