// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  authorizeSession: vi.fn(),
  saveNewSubmission: vi.fn(),
  saveSubmissionEdit: vi.fn(),
  deleteSubmissionRecord: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("~/server/auth/access", () => ({
  authorizeSession: mocks.authorizeSession,
}));
vi.mock("~/server/submissions/store", () => ({
  saveNewSubmission: mocks.saveNewSubmission,
  saveSubmissionEdit: mocks.saveSubmissionEdit,
  deleteSubmissionRecord: mocks.deleteSubmissionRecord,
}));

const { deleteSubmission, recordSubmission, updateSubmission } =
  await import("./submissions");

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const HACKATHON = "33333333-3333-4333-8333-333333333333";
const SUBMISSION = "44444444-4444-4444-8444-444444444444";
const URL = "https://devpost.com/software/dogdays";
const refused = new ExpectedFailure(
  "Only the project's owners can record submissions.",
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorizeSession.mockResolvedValue({
    ok: true,
    caller: { userId: USER },
  });
});

describe("every Submission action", () => {
  it("returns the session refusal before parsing or any record rule", async () => {
    mocks.authorizeSession.mockResolvedValue({
      ok: false,
      message: "Sign in.",
    });
    const signedOut = { ok: false, message: "Sign in." };
    expect(await recordSubmission(PROJECT, HACKATHON, URL, [USER])).toEqual(
      signedOut,
    );
    expect(await updateSubmission(SUBMISSION, URL, [USER])).toEqual(signedOut);
    expect(await deleteSubmission(SUBMISSION)).toEqual(signedOut);
    expect(mocks.saveNewSubmission).not.toHaveBeenCalled();
    expect(mocks.saveSubmissionEdit).not.toHaveBeenCalled();
    expect(mocks.deleteSubmissionRecord).not.toHaveBeenCalled();
  });

  it("passes the signed-in user's id as the actor, never one from the client", async () => {
    mocks.saveNewSubmission.mockResolvedValue({ id: SUBMISSION });
    mocks.saveSubmissionEdit.mockResolvedValue({ projectId: PROJECT });
    mocks.deleteSubmissionRecord.mockResolvedValue({ projectId: PROJECT });
    await recordSubmission(PROJECT, HACKATHON, URL, [USER], "1st");
    await updateSubmission(SUBMISSION, URL, [USER]);
    await deleteSubmission(SUBMISSION);
    expect(mocks.saveNewSubmission.mock.calls[0]![0]).toBe(USER);
    expect(mocks.saveSubmissionEdit.mock.calls[0]![0]).toBe(USER);
    expect(mocks.deleteSubmissionRecord).toHaveBeenCalledWith(USER, SUBMISSION);
  });
});

describe("recordSubmission", () => {
  it("records, answers with the id and revalidates the project and hackathons pages", async () => {
    mocks.saveNewSubmission.mockResolvedValue({ id: SUBMISSION });
    expect(
      await recordSubmission(PROJECT, HACKATHON, URL, [USER], "1st"),
    ).toEqual({
      ok: true,
      data: { id: SUBMISSION },
      message: "Submission recorded.",
    });
    expect(mocks.saveNewSubmission).toHaveBeenCalledWith(
      USER,
      PROJECT,
      HACKATHON,
      expect.objectContaining({ url: URL, teamUserIds: [USER], result: "1st" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/dashboard/projects/${PROJECT}`,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/hackathons");
  });

  it("returns the owner rule's refusal and revalidates nothing", async () => {
    mocks.saveNewSubmission.mockRejectedValue(refused);
    expect(await recordSubmission(PROJECT, HACKATHON, URL, [USER])).toEqual({
      ok: false,
      message: refused.message,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["a bad project id", ["nope", HACKATHON, URL, [USER]]],
    ["a bad hackathon id", [PROJECT, "nope", URL, [USER]]],
    ["a bad member id", [PROJECT, HACKATHON, URL, ["nope"]]],
    ["a huge url", [PROJECT, HACKATHON, "x".repeat(4097), [USER]]],
    ["a huge result", [PROJECT, HACKATHON, URL, [USER], "r".repeat(2001)]],
  ] as const)("refuses %s before the record rule", async (_name, args) => {
    expect(
      await recordSubmission(
        ...(args as unknown as Parameters<typeof recordSubmission>),
      ),
    ).toEqual({
      ok: false,
      message: "That submission is invalid.",
    });
    expect(mocks.saveNewSubmission).not.toHaveBeenCalled();
  });
});

describe("updateSubmission", () => {
  it("updates and revalidates the Submission's own project", async () => {
    mocks.saveSubmissionEdit.mockResolvedValue({ projectId: PROJECT });
    expect(await updateSubmission(SUBMISSION, URL, [USER], null)).toEqual({
      ok: true,
      message: "Submission updated.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/dashboard/projects/${PROJECT}`,
    );
  });

  it("returns the refusal with its field errors", async () => {
    mocks.saveSubmissionEdit.mockRejectedValue(
      new ExpectedFailure("Check the highlighted fields.", { url: "Taken." }),
    );
    expect(await updateSubmission(SUBMISSION, URL, [USER])).toEqual({
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: { url: "Taken." },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a bad id before the record rule", async () => {
    expect(await updateSubmission("nope", URL, [USER])).toEqual({
      ok: false,
      message: "That submission is invalid.",
    });
    expect(mocks.saveSubmissionEdit).not.toHaveBeenCalled();
  });
});

describe("deleteSubmission", () => {
  it("deletes and revalidates", async () => {
    mocks.deleteSubmissionRecord.mockResolvedValue({ projectId: PROJECT });
    expect(await deleteSubmission(SUBMISSION)).toEqual({
      ok: true,
      message: "Submission deleted.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/dashboard/projects/${PROJECT}`,
    );
  });

  it("returns the refusal for a Submission that is missing or not theirs", async () => {
    mocks.deleteSubmissionRecord.mockRejectedValue(
      new ExpectedFailure("That submission was not found."),
    );
    expect(await deleteSubmission(SUBMISSION)).toEqual({
      ok: false,
      message: "That submission was not found.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a malformed id", async () => {
    expect(await deleteSubmission("nope")).toEqual({
      ok: false,
      message: "That submission is invalid.",
    });
    expect(mocks.deleteSubmissionRecord).not.toHaveBeenCalled();
  });
});
