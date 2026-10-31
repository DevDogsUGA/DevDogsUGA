import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failure, success } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
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
vi.mock("~/server/actions/submissions", () => ({
  recordSubmission: mocks.record,
  updateSubmission: mocks.update,
  deleteSubmission: mocks.remove,
}));
vi.mock("~/server/actions/projects", () => ({
  linkRepoAction: vi.fn(),
}));
vi.mock("~/server/actions/projectCommits", () => ({
  refreshProjectCommitsAction: vi.fn(),
}));

const { RecordSubmissionForm, SubmissionControls } =
  await import("./SubmissionForms");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PROJECT = "22222222-2222-4222-8222-222222222222";
const HACKATHONS = [
  { id: "h-open", name: "HackGT", when: "Nov 1 – Nov 3, 2026" },
  { id: "h-old", name: "HackUGA", when: null },
];
const MEMBERS = [
  { userId: "u-ada", name: "Ada" },
  { userId: "u-grace", name: "Grace" },
];

describe("RecordSubmissionForm", () => {
  it("records the first hackathon with the link, the ticked team and the result", async () => {
    const user = userEvent.setup();
    mocks.record.mockResolvedValue(
      success({ id: "s-1" }, "Submission recorded."),
    );
    render(
      <RecordSubmissionForm
        projectId={PROJECT}
        hackathons={HACKATHONS}
        members={MEMBERS}
      />,
    );
    await user.type(
      screen.getByLabelText<HTMLInputElement>(/Submission link/),
      "https://devpost.com/software/x",
    );
    await user.click(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Grace" }),
    );
    await user.type(
      screen.getByLabelText<HTMLInputElement>(/Result/),
      "Winner",
    );
    await user.click(screen.getByRole("button", { name: "Record submission" }));

    await waitFor(() =>
      expect(mocks.record).toHaveBeenCalledWith(
        PROJECT,
        "h-open",
        "https://devpost.com/software/x",
        ["u-grace"],
        "Winner",
      ),
    );
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith("Submission recorded."),
    );
    // A recorded entry clears the form for the next one.
    expect(
      screen.getByLabelText<HTMLInputElement>(/Submission link/).value,
    ).toBe("");
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Grace" }).checked,
    ).toBe(false);
  });

  it("sends a blank result as null", async () => {
    const user = userEvent.setup();
    mocks.record.mockResolvedValue(success({ id: "s-1" }));
    render(
      <RecordSubmissionForm
        projectId={PROJECT}
        hackathons={HACKATHONS}
        members={MEMBERS}
      />,
    );
    await user.type(
      screen.getByLabelText<HTMLInputElement>(/Submission link/),
      "https://devpost.com/software/x",
    );
    await user.click(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Ada" }),
    );
    await user.click(screen.getByRole("button", { name: "Record submission" }));
    await waitFor(() =>
      expect(mocks.record).toHaveBeenCalledWith(
        PROJECT,
        "h-open",
        "https://devpost.com/software/x",
        ["u-ada"],
        null,
      ),
    );
  });

  it("puts a refusal under its field and keeps what was typed", async () => {
    const user = userEvent.setup();
    mocks.record.mockResolvedValue(
      failure("Check the highlighted fields.", {
        url: "That submission link is already recorded.",
        team: "Add at least one team member.",
      }),
    );
    render(
      <RecordSubmissionForm
        projectId={PROJECT}
        hackathons={HACKATHONS}
        members={MEMBERS}
      />,
    );
    await user.type(
      screen.getByLabelText<HTMLInputElement>(/Submission link/),
      "https://devpost.com/software/x",
    );
    await user.click(screen.getByRole("button", { name: "Record submission" }));

    expect(
      await screen.findByText("That submission link is already recorded."),
    ).toBeTruthy();
    expect(screen.getByText("Add at least one team member.")).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLInputElement>(/Submission link/).value,
    ).toBe("https://devpost.com/software/x");
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("shows a refusal about the whole entry beside the button", async () => {
    const user = userEvent.setup();
    mocks.record.mockResolvedValue(
      failure("Only the project's owners can record submissions."),
    );
    render(
      <RecordSubmissionForm
        projectId={PROJECT}
        hackathons={HACKATHONS}
        members={MEMBERS}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Record submission" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Only the project's owners can record submissions.",
    );
  });

  it("says so, and offers no form, when no hackathon is approved", () => {
    render(
      <RecordSubmissionForm
        projectId={PROJECT}
        hackathons={[]}
        members={MEMBERS}
      />,
    );
    expect(screen.getByText(/No approved hackathons/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Record submission" }),
    ).toBeNull();
  });
});

describe("SubmissionControls", () => {
  const submission = {
    id: "s-1",
    url: "https://devpost.com/software/x",
    result: "Finalist",
    team: ["Ada", "Linus"],
    teamUserIds: ["u-ada", "u-linus"],
  };

  it("edits in place, keeping a team member who is no longer a candidate ticked", async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue(success(undefined, "Submission updated."));
    render(<SubmissionControls submission={submission} members={MEMBERS} />);
    expect(screen.queryByLabelText(/Submission link/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Linus" }).checked,
    ).toBe(true);
    await user.click(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Grace" }),
    );
    await user.clear(screen.getByLabelText<HTMLInputElement>(/Result/));
    await user.type(
      screen.getByLabelText<HTMLInputElement>(/Result/),
      "Winner",
    );
    await user.click(screen.getByRole("button", { name: "Save submission" }));

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        "s-1",
        "https://devpost.com/software/x",
        ["u-ada", "u-linus", "u-grace"],
        "Winner",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText(/Submission link/)).toBeNull(),
    );
  });

  it("keeps the form open and shows the error when the update fails", async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue(failure("That submission was not found."));
    render(<SubmissionControls submission={submission} members={MEMBERS} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save submission" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "That submission was not found.",
    );
    expect(
      screen.getByLabelText<HTMLInputElement>(/Submission link/),
    ).toBeTruthy();
  });

  it("deletes after confirming, and shows the error when it fails", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue(failure("That submission was not found."));
    render(<SubmissionControls submission={submission} members={MEMBERS} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("s-1"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "That submission was not found.",
    );
  });
});
