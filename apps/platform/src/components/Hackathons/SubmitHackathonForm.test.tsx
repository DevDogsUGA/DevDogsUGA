import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("~/lib/toast", () => ({ toast: { success: mocks.success } }));
vi.mock("~/server/actions/hackathons", () => ({
  submitHackathonAction: mocks.submit,
}));

const { SubmitHackathonForm } = await import("./SubmitHackathonForm");

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText(/web address/i),
    "https://h.example.com",
  );
  await user.type(screen.getByLabelText(/^name/i), "Great Hack");
}

describe("SubmitHackathonForm", () => {
  it("has the link and name as required, and the two dates optional", () => {
    render(<SubmitHackathonForm />);
    expect(screen.getByLabelText(/web address/i)).toBeRequired();
    expect(screen.getByLabelText(/^name/i)).toBeRequired();
    expect(screen.getByLabelText(/starts/i)).not.toBeRequired();
    expect(screen.getByLabelText(/ends/i)).not.toBeRequired();
    expect(screen.getByLabelText(/starts/i)).toHaveAttribute("type", "date");
  });

  it("submits the fields as form data, then toasts and refreshes", async () => {
    mocks.submit.mockResolvedValue({
      ok: true,
      data: { status: "created", id: "h" },
      message: "Hackathon submitted. An officer will review it.",
    });
    const user = userEvent.setup();
    render(<SubmitHackathonForm />);
    await fill(user);
    await user.type(screen.getByLabelText(/starts/i), "2026-11-02");
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const data = mocks.submit.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(data)).toEqual({
      url: "https://h.example.com",
      name: "Great Hack",
      startsOn: "2026-11-02",
      endsOn: "",
    });
    expect(mocks.success).toHaveBeenCalledWith(
      "Hackathon submitted. An officer will review it.",
    );
    expect(screen.queryByText(/see it in the list/i)).not.toBeInTheDocument();
  });

  it("disables the button while the submission is in flight", async () => {
    let finish!: (value: unknown) => void;
    mocks.submit.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<SubmitHackathonForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Submit for review" }),
      ).toBeDisabled(),
    );
    finish({ ok: true, data: { status: "created", id: "h" } });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Submit for review" }),
      ).toBeEnabled(),
    );
  });

  it("shows each field's error beside its field and the message in an alert", async () => {
    mocks.submit.mockResolvedValue({
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: {
        url: "Enter the hackathon's web address (https).",
        endsOn: "The end can't be before the start.",
      },
    });
    const user = userEvent.setup();
    render(<SubmitHackathonForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(
      await screen.findByText("Enter the hackathon's web address (https)."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The end can't be before the start."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("alert").map((alert) => alert.textContent),
    ).toContain("Check the highlighted fields.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("points to the existing entry when the link is on file and this member can see it", async () => {
    mocks.submit.mockResolvedValue({
      ok: true,
      data: {
        status: "exists",
        id: "h-9",
        approval: "approved",
        linkable: true,
      },
      message: "That hackathon is already listed.",
    });
    const user = userEvent.setup();
    render(<SubmitHackathonForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    const link = await screen.findByRole("link", {
      name: "See it in the list",
    });
    expect(link).toHaveAttribute("href", "#hackathon-h-9");
  });

  it("says it is waiting when the member cannot see the entry yet", async () => {
    mocks.submit.mockResolvedValue({
      ok: true,
      data: {
        status: "exists",
        id: "h-9",
        approval: "pending",
        linkable: false,
      },
    });
    const user = userEvent.setup();
    render(<SubmitHackathonForm />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(
      await screen.findByText(/waiting for an officer to review it/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "See it in the list" }),
    ).not.toBeInTheDocument();
  });
});
