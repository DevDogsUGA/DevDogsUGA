import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  dismiss: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({
  toast: { success: mocks.toast, error: vi.fn() },
}));
vi.mock("~/server/actions/moderation", () => ({
  resolveReport: mocks.resolve,
  dismissReport: mocks.dismiss,
}));

const { default: ReportActionForm } = await import("./ReportActionForm");

const REPORT = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderForm() {
  return render(<ReportActionForm reportId={REPORT} quarantinable />);
}

describe("ReportActionForm resolving", () => {
  it("resolves with the chosen actions, toasts, and returns to the queue", async () => {
    const user = userEvent.setup();
    mocks.resolve.mockResolvedValue(success(undefined, "Report resolved."));
    renderForm();
    await user.selectOptions(
      screen.getByLabelText("Content action"),
      "quarantine",
    );
    await user.type(screen.getByLabelText(/Moderator note/), "clear case");
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() =>
      expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith(
        REPORT,
        "no_action",
        "no_action",
        "quarantine",
        "clear case",
        false,
      ),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/moderation"),
    );
    expect(mocks.toast).toHaveBeenCalledWith("Report resolved.");
  });

  it("shows a report someone already decided inline, and stays on the page", async () => {
    const user = userEvent.setup();
    mocks.resolve.mockResolvedValue(
      failure("Someone has already decided this report."),
    );
    renderForm();
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(
      await screen.findByText("Someone has already decided this report."),
    ).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("asks before banning, and only then resolves", async () => {
    const user = userEvent.setup();
    mocks.resolve.mockResolvedValue(success(undefined, "Report resolved."));
    renderForm();
    await user.selectOptions(screen.getByLabelText("Subject action"), "ban");
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(mocks.resolve).not.toHaveBeenCalled();
    await user.click(
      await screen.findByRole("button", { name: "Ban and resolve" }),
    );
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
    expect(mocks.resolve.mock.calls[0]![1]).toBe("ban");
  });

  it("shows a refusal after the confirm, not a thrown error", async () => {
    const user = userEvent.setup();
    mocks.resolve.mockResolvedValue(failure("Not authorized."));
    renderForm();
    await user.selectOptions(
      screen.getByLabelText("Subject action"),
      "suspend",
    );
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await user.click(
      await screen.findByRole("button", { name: "Suspend and resolve" }),
    );
    expect(await screen.findByText("Not authorized.")).toBeVisible();
  });
});

describe("ReportActionForm dismissing", () => {
  it("confirms, dismisses with the note, and returns to the queue", async () => {
    const user = userEvent.setup();
    mocks.dismiss.mockResolvedValue(success(undefined, "Report dismissed."));
    renderForm();
    await user.type(screen.getByLabelText(/Moderator note/), "spam");
    await user.click(screen.getByRole("button", { name: "Dismiss report" }));
    expect(mocks.dismiss).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(mocks.dismiss).toHaveBeenCalledExactlyOnceWith(REPORT, "spam"),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/moderation"),
    );
    expect(mocks.toast).toHaveBeenCalledWith("Report dismissed.");
  });

  it("shows why a dismissal was refused", async () => {
    const user = userEvent.setup();
    mocks.dismiss.mockResolvedValue(failure("That report no longer exists."));
    renderForm();
    await user.click(screen.getByRole("button", { name: "Dismiss report" }));
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(
      await screen.findByText("That report no longer exists."),
    ).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("ReportActionForm with its own transport", () => {
  it("hands the decision to onResolve and calls no action", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(
      <ReportActionForm
        reportId={REPORT}
        quarantinable={false}
        onResolve={onResolve}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ subjectAction: "no_action" }),
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
