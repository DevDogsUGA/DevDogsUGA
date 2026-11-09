import type { Question } from "@devdogsuga/events";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SurveyActionState } from "~/server/actions/survey";
import type { Survey } from "~/server/survey/load";

/**
 * What the survey form posts. The saved answers are folded away, and a
 * folded field that went missing from the form would read as the member
 * clearing it, so this checks they are still submitted while closed, that
 * every shown question is marked `asked`, and that a rejected save keeps
 * what was typed.
 */

const submitted = vi.hoisted(() => ({ data: null as FormData | null }));
const reply = vi.hoisted(() => {
  const state: SurveyActionState = { ok: true, message: "Answers saved." };
  return { state };
});
vi.mock("~/server/actions/survey", () => ({
  saveSurvey: (_previous: unknown, data: FormData) => {
    submitted.data = data;
    return Promise.resolve(reply.state);
  },
}));

const { default: CheckInSurvey } = await import("./CheckInSurvey");

const experience: Question = {
  id: "developer_experience",
  scope: "member",
  prompt: "My level of developer experience is…",
  type: "choice",
  options: [
    { id: "beginner", label: "Beginner" },
    { id: "advanced", label: "Advanced" },
  ],
};

const organization: Question = {
  id: "organization",
  scope: "member",
  prompt: "What company or organization are you a part of, if any?",
  type: "text",
};

const learn: Question = {
  id: "how_did_you_learn",
  scope: "meeting",
  prompt: "How did you learn about this event?",
  type: "choice",
  options: [{ id: "discord", label: "Discord" }],
  other: true,
  required: true,
};

const survey: Survey = {
  meetingId: "fc3dd5b9-5779-46fc-bdf5-d9194a138630",
  meetingLabel: "Build Session #3",
  unanswered: [{ question: organization, answer: null }],
  saved: [{ question: experience, answer: { option: "advanced" } }],
  meeting: [{ question: learn, answer: null }],
  deadline: new Date("2026-10-07T23:00:00Z"),
  meetingOpen: true,
};

afterEach(() => {
  cleanup();
  submitted.data = null;
});

describe("CheckInSurvey", () => {
  it("submits the folded saved answers and marks every shown question asked", async () => {
    const user = userEvent.setup();
    render(<CheckInSurvey survey={survey} />);

    expect(
      screen.getByRole("button", { name: "Your saved answers (1)" }),
    ).toBeTruthy();
    await user.type(screen.getByLabelText(organization.prompt), "UGA");
    await user.click(screen.getByLabelText("Discord"));
    await user.click(screen.getByRole("button", { name: "Save answers" }));

    await waitFor(() => expect(submitted.data).not.toBeNull());
    const data = submitted.data!;
    expect(data.get("meetingId")).toBe(survey.meetingId);
    expect(data.getAll("asked").sort()).toEqual(
      [experience.id, learn.id, organization.id].sort(),
    );
    expect(data.get(`q:${experience.id}`)).toBe("advanced");
    expect(data.get(`q:${organization.id}`)).toBe("UGA");
    expect(data.get(`q:${learn.id}`)).toBe("discord");
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "Answers saved.",
    );
  });

  it("keeps what was typed and shows the error when a save is refused", async () => {
    reply.state = {
      ok: false,
      message: "Check the highlighted answers.",
      errors: { [learn.id]: "Answer this question." },
    };
    const user = userEvent.setup();
    render(<CheckInSurvey survey={survey} />);
    const field = screen.getByLabelText(organization.prompt);
    await user.type(field, "UGA");
    await user.click(screen.getByRole("button", { name: "Save answers" }));

    expect(await screen.findByText("Answer this question.")).toBeTruthy();
    expect((field as HTMLInputElement).value).toBe("UGA");
  });

  it("says when a meeting's questions have closed instead of asking them", () => {
    render(<CheckInSurvey survey={{ ...survey, meetingOpen: false }} />);
    expect(screen.queryByText(learn.prompt)).toBeNull();
    expect(screen.getByText(/questions closed/)).toBeTruthy();
  });
});
