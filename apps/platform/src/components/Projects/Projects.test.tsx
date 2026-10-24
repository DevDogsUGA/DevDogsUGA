import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectReportView } from "~/server/projects/load";

vi.mock("~/server/actions/projects", () => ({
  submitReportAction: () => Promise.resolve({ ok: true, message: "" }),
  reviewReportAction: () => Promise.resolve({ ok: true, message: "" }),
}));

const { default: ReportForm } = await import("./ReportForm");
const { default: ReportCard } = await import("./ReportCard");
const { default: ReviewForm } = await import("./ReviewForm");

afterEach(cleanup);

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

const pr = (id: string, selected = false) => ({
  id,
  repo: "DevDogsUGA/DogDays",
  number: 12,
  title: "Add the feed",
  url: "https://github.com/DevDogsUGA/DogDays/pull/12",
  merged: "Oct 12, 2026",
  selected,
});

function form(props: Partial<Parameters<typeof ReportForm>[0]> = {}) {
  return render(
    <ReportForm
      projectId="p-1"
      projectName="DogDays"
      today="2026-10-24"
      values={{
        reportId: null,
        startDate: "",
        endDate: "",
        hours: "",
        content: "",
      }}
      pullRequests={[pr("c-1"), pr("c-2", true)]}
      {...props}
    />,
  );
}

describe("the report form", () => {
  it("holds Submit until the reflection reaches 100 words", () => {
    form();
    const submit = screen.getByRole<HTMLButtonElement>("button", {
      name: "Submit report",
    });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText("0 of 100 words")).toBeTruthy();

    const text = screen.getByLabelText(/What you did and learned/);
    fireEvent.change(text, { target: { value: words(99) } });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/1 to go/)).toBeTruthy();

    fireEvent.change(text, { target: { value: words(100) } });
    expect(submit.disabled).toBe(false);
  });

  it("offers the eligible pull requests, keeping the ones already cited ticked", () => {
    form();
    const boxes = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(boxes.map((b) => [b.name, b.value, b.checked])).toEqual([
      ["contributionId", "c-1", false],
      ["contributionId", "c-2", true],
    ]);
  });

  it("caps the dates at today, and asks for quarter hours", () => {
    form();
    expect(screen.getByLabelText<HTMLInputElement>(/Through/).max).toBe(
      "2026-10-24",
    );
    const hours = screen.getByLabelText<HTMLInputElement>(/Hours worked/);
    expect([hours.min, hours.step]).toEqual(["0.25", "0.25"]);
  });

  it("resubmits a returned report under its own id", () => {
    form({
      values: {
        reportId: "r-1",
        startDate: "2026-10-01",
        endDate: "2026-10-14",
        hours: "6.5",
        content: words(120),
      },
    });
    expect(
      screen.getByRole("button", { name: "Resubmit report" }),
    ).toBeTruthy();
    const hidden = document.querySelector<HTMLInputElement>(
      'input[name="reportId"]',
    );
    expect(hidden?.value).toBe("r-1");
  });

  it("says plainly when there are no pull requests to cite", () => {
    form({ pullRequests: [] });
    expect(screen.getByText(/No unclaimed merged pull requests/)).toBeTruthy();
  });
});

function report(overrides: Partial<ProjectReportView> = {}): ProjectReportView {
  return {
    id: "r-1",
    projectId: "p-1",
    projectName: "DogDays",
    authorId: "u-1",
    authorName: "Ada",
    startDate: "2026-10-01",
    endDate: "2026-10-14",
    hours: 6.5,
    approvedHours: null,
    content: words(100),
    status: "submitted",
    reviewNote: null,
    reviewedByName: null,
    submittedAt: new Date("2026-10-15T12:00:00Z"),
    pullRequests: [],
    ...overrides,
  };
}

describe("the report card", () => {
  it("shows claimed and approved hours, and the reviewer's note when returned", () => {
    render(
      <ul>
        <ReportCard
          report={report({
            status: "returned",
            reviewNote: "Say what you built.",
            reviewedByName: "Grace",
          })}
        />
        <ReportCard
          report={report({
            id: "r-2",
            status: "approved",
            approvedHours: 5,
          })}
          showAuthor
        />
      </ul>,
    );
    expect(screen.getByText("Returned")).toBeTruthy();
    expect(screen.getByText(/Grace says/)).toBeTruthy();
    expect(screen.getByText("Say what you built.", { exact: false })).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText(/Ada · Oct 1, 2026 to Oct 14, 2026/)).toBeTruthy();
    expect(screen.getByText(/5 h approved/)).toBeTruthy();
    expect(screen.getAllByText(/100 words/)).toHaveLength(2);
  });

  it("lists the pull requests as links", () => {
    render(
      <ul>
        <ReportCard
          report={report({
            pullRequests: [
              {
                id: "c-1",
                repo: "DevDogsUGA/DogDays",
                number: 12,
                title: "Add the feed",
                url: "https://github.com/DevDogsUGA/DogDays/pull/12",
                mergedAt: new Date("2026-10-12T12:00:00Z"),
              },
            ],
          })}
        />
      </ul>,
    );
    expect(
      screen
        .getByRole("link", { name: "DevDogsUGA/DogDays#12" })
        .getAttribute("href"),
    ).toBe("https://github.com/DevDogsUGA/DogDays/pull/12");
  });
});

describe("the review form", () => {
  it("starts from the claimed hours and offers approve or return", () => {
    render(<ReviewForm reportId="r-1" claimedHours={6.5} />);
    expect(screen.getByLabelText<HTMLInputElement>(/Hours to approve/).value).toBe(
      "6.5",
    );
    const approve = screen.getByRole<HTMLButtonElement>("button", {
      name: "Approve",
    });
    const send = screen.getByRole<HTMLButtonElement>("button", {
      name: "Return with note",
    });
    expect([approve.name, approve.value]).toEqual(["intent", "approve"]);
    expect([send.name, send.value]).toEqual(["intent", "return"]);
  });
});
