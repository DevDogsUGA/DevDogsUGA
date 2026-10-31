import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectReportView } from "~/server/projects/load";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("~/server/actions/projects", () => ({
  fileReportAction: () => Promise.resolve({ ok: true }),
  reviewReportAction: () => Promise.resolve({ ok: true }),
  createProjectAction: () => Promise.resolve({ ok: true }),
  updateProjectAction: () => Promise.resolve({ ok: true }),
  linkRepoAction: () => Promise.resolve({ ok: true }),
}));
vi.mock("~/server/actions/projectCommits", () => ({
  refreshProjectCommitsAction: () => Promise.resolve({ ok: true }),
}));

const { default: ReportForm } = await import("./ReportForm");
const { default: ReportCard } = await import("./ReportCard");
const { default: ReviewForm } = await import("./ReviewForm");
const { default: NewProjectForm } = await import("./NewProjectForm");

afterEach(cleanup);

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

const commit = (sha: string, day: string, selected = false) => ({
  sha: sha.repeat(40).slice(0, 40),
  title: `Commit ${sha}`,
  day,
  detail: `${day} · 3 files, +10 −2`,
  url: `https://github.com/DevDogsUGA/DogDays/commit/${sha.repeat(40).slice(0, 40)}`,
  repo: "DevDogsUGA/DogDays",
  selected,
});

const IN_RANGE = {
  startDate: "2026-10-01",
  endDate: "2026-10-14",
};

function form(props: Partial<Parameters<typeof ReportForm>[0]> = {}) {
  return render(
    <ReportForm
      projectId="p-1"
      projectName="DogDays"
      today="2026-10-24"
      projectHref="/dashboard/projects/dogdays"
      values={{ reportId: null, ...IN_RANGE, hours: "", content: "" }}
      commits={[
        commit("a", "2026-10-05"),
        commit("b", "2026-10-10", true),
        commit("c", "2026-10-20"),
      ]}
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

  it("offers only the commits inside the date range, keeping cited ones ticked", () => {
    form();
    const boxes = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(boxes.map((b) => [b.name, b.value.slice(0, 1), b.checked])).toEqual([
      ["sha", "a", false],
      ["sha", "b", true],
    ]);
    expect(screen.queryByText(/Commit c/)).toBeNull();
  });

  it("follows the range: widening it offers the later commit", () => {
    form();
    fireEvent.change(screen.getByLabelText(/Through/), {
      target: { value: "2026-10-24" },
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("drops a ticked commit from the submission when the range leaves it out", () => {
    form();
    fireEvent.change(screen.getByLabelText(/From/), {
      target: { value: "2026-10-08" },
    });
    fireEvent.change(screen.getByLabelText(/Through/), {
      target: { value: "2026-10-09" },
    });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(
      screen.getByText(/None of your commits landed in that range/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/What you did and learned/), {
      target: { value: words(100) },
    });
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Submit report" })
        .disabled,
    ).toBe(true);
  });

  it("holds Submit until at least one commit in range is ticked", () => {
    form({ commits: [commit("a", "2026-10-05")] });
    fireEvent.change(screen.getByLabelText(/What you did and learned/), {
      target: { value: words(100) },
    });
    const submit = screen.getByRole<HTMLButtonElement>("button", {
      name: "Submit report",
    });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit.disabled).toBe(false);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit.disabled).toBe(true);
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
        ...IN_RANGE,
        hours: "6.5",
        content: words(120),
      },
    });
    expect(
      screen.getByRole("button", { name: "Resubmit report" }),
    ).toBeTruthy();
    expect(
      document.querySelector<HTMLInputElement>('input[name="reportId"]')?.value,
    ).toBe("r-1");
  });

  it("says plainly when there are no commits to cite", () => {
    form({ commits: [] });
    expect(screen.getByText(/No unclaimed commits of yours/)).toBeTruthy();
  });
});

function report(overrides: Partial<ProjectReportView> = {}): ProjectReportView {
  return {
    id: "r-1",
    projectId: "p-1",
    projectName: "DogDays",
    projectSlug: "dogdays",
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
    commits: [],
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
          report={report({ id: "r-2", status: "approved", approvedHours: 5 })}
          showAuthor
        />
      </ul>,
    );
    expect(screen.getByText("Returned")).toBeTruthy();
    expect(screen.getByText(/Grace says/)).toBeTruthy();
    expect(
      screen.getByText("Say what you built.", { exact: false }),
    ).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText(/Ada · Oct 1, 2026 to Oct 14, 2026/)).toBeTruthy();
    expect(screen.getByText(/5 h approved/)).toBeTruthy();
    expect(screen.getAllByText(/100 words/)).toHaveLength(2);
  });

  it("lists each cited commit with its message, date, size and GitHub link", () => {
    const sha = "1234567".padEnd(40, "0");
    render(
      <ul>
        <ReportCard
          report={report({
            commits: [
              {
                sha,
                title: "Add the feed",
                committedAt: new Date("2026-10-12T16:00:00Z"),
                files: 3,
                additions: 40,
                deletions: 2,
                repo: "DevDogsUGA/DogDays",
                url: `https://github.com/DevDogsUGA/DogDays/commit/${sha}`,
              },
            ],
          })}
        />
      </ul>,
    );
    expect(
      screen.getByRole("link", { name: "1234567" }).getAttribute("href"),
    ).toBe(`https://github.com/DevDogsUGA/DogDays/commit/${sha}`);
    expect(screen.getByText("Add the feed")).toBeTruthy();
    expect(screen.getByText(/Oct 12, 2026 · 3 files, \+40 −2/)).toBeTruthy();
  });

  it("shows a commit whose size is still being counted without one", () => {
    render(
      <ul>
        <ReportCard
          report={report({
            commits: [
              {
                sha: "f".repeat(40),
                title: "Pending stats",
                committedAt: new Date("2026-10-12T16:00:00Z"),
                files: null,
                additions: null,
                deletions: null,
                repo: "a/b",
                url: "https://github.com/a/b/commit/x",
              },
            ],
          })}
        />
      </ul>,
    );
    expect(screen.getByText("Oct 12, 2026")).toBeTruthy();
  });
});

describe("the review form", () => {
  it("starts from the claimed hours and offers approve or return", () => {
    render(<ReviewForm reportId="r-1" claimedHours={6.5} />);
    expect(
      screen.getByLabelText<HTMLInputElement>(/Hours to approve/).value,
    ).toBe("6.5");
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

describe("the new project form", () => {
  it("asks for a name, tags and at least one repository, as owner/name", () => {
    render(<NewProjectForm />);
    expect(
      screen.getByLabelText<HTMLInputElement>(/Project name/).required,
    ).toBe(true);
    const repos = screen.getByLabelText<HTMLTextAreaElement>(/Repositories/);
    expect(repos.required).toBe(true);
    expect(screen.getByLabelText(/Tags/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create project" })).toBeTruthy();
    expect(screen.getByText(/waits for an officer/)).toBeTruthy();
  });
});
