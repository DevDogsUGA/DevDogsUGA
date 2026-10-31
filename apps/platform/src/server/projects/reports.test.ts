// @vitest-environment node
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- asymmetric matchers (expect.any, stringContaining) are typed any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "~/server/auth/access";
import { fakeDb, type Fixture } from "./fakeDb";

const mocks = vi.hoisted(() => ({
  db: {} as { transaction: unknown; execute: unknown },
}));
vi.mock("~/server/db", () => ({ db: mocks.db }));
vi.mock("~/server/auth/access", () => ({
  rules: {
    officer: (caller: { isLeader: boolean }) => caller.isLeader,
    reviewProjectReports: (caller: {
      flags: { canReviewProjectReports: boolean };
    }) => caller.flags.canReviewProjectReports,
  },
}));

const { commitTakenMessage, deleteReport, fileReport, reviewReport } =
  await import("./reports");

const PROJECT = "d3000000-0000-4000-a000-000000000001";
const REPORT = "d3000000-0000-4000-a000-0000000000b1";
const MEMBER = "d3000000-0000-4000-a000-0000000000a1";
const OTHER = "d3000000-0000-4000-a000-0000000000a2";
const ADVISOR = "d3000000-0000-4000-a000-0000000000a3";
const OFFICER = "d3000000-0000-4000-a000-0000000000a4";
const REVIEWER = "d3000000-0000-4000-a000-0000000000a5";
const SHA = "ab".repeat(20);
const SHA2 = "cd".repeat(20);
const NOW = new Date("2026-10-24T16:00:00Z");

const caller = (
  userId: string,
  over: { isLeader?: boolean; canReview?: boolean } = {},
) =>
  ({
    userId,
    isLeader: over.isLeader ?? false,
    minRank: Infinity,
    flags: { canReviewProjectReports: over.canReview ?? false },
  }) as unknown as Caller;

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const input = (over: Record<string, unknown> = {}) => ({
  projectId: PROJECT,
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  hours: 6.5,
  content: words(100),
  shas: [SHA],
  ...over,
});

let fake: ReturnType<typeof fakeDb>;
function use(fixture: Partial<Fixture> = {}) {
  fake = fakeDb({
    project: null,
    owners: [],
    report: null,
    execute: [],
    ...fixture,
  });
  mocks.db.transaction = fake.db.transaction;
  mocks.db.execute = fake.db.execute;
}

/** The queries a fileable report reads: project, contributor, eligible commits, nothing taken. */
const fileable = (
  over: {
    project?: unknown;
    eligible?: unknown[];
    taken?: unknown[];
    contributor?: unknown[];
  } = {},
): [string, never[]][] => [
  ["projectReportContributions", []],
  ["for share", (over.project ?? [{ status: "active" }]) as never[]],
  [
    "distinct on (c.sha)",
    (over.eligible ?? [{ sha: SHA, repoId: "11" }]) as never[],
  ],
  ["where pc.sha in", (over.taken ?? []) as never[]],
  ["limit 1", (over.contributor ?? [{ x: 1 }]) as never[]],
];

beforeEach(() => {
  vi.resetAllMocks();
  use();
});

describe("who may file", () => {
  it("is a contributor to an active project", async () => {
    use({ execute: fileable() });
    expect(await fileReport(caller(MEMBER), input(), NOW)).toEqual({
      ok: true,
      data: { reportId: "new-id" },
      message: "Report submitted for review.",
    });
    expect(fake.writes("insert", "projectReports")[0]!.values).toMatchObject({
      userId: MEMBER,
      hours: "6.50",
    });
    const citation = fake.ran('insert into platform."projectReportCommits"');
    expect(citation).toHaveLength(1);
    expect(citation[0]!.params).toEqual(["new-id", SHA, "11"]);
    expect(fake.audits()).toEqual(["projectReport.submitted"]);
  });

  it("is never an officer (Q125), and writes nothing", async () => {
    use({ execute: fileable() });
    const result = await fileReport(
      caller(OFFICER, { isLeader: true }),
      input(),
      NOW,
    );
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("handled separately"),
    });
    expect(fake.writes("insert", "projectReports")).toHaveLength(0);
  });

  it("is not a member with no commits in the project's repos", async () => {
    use({ execute: fileable({ contributor: [] }) });
    expect(await fileReport(caller(OTHER), input(), NOW)).toMatchObject({
      ok: false,
      message: expect.stringContaining("commits in this project"),
    });
  });

  it("is not for an archived project, a legacy one or a missing one", async () => {
    use({ execute: fileable({ project: [{ status: "archived" }] }) });
    expect(await fileReport(caller(MEMBER), input(), NOW)).toMatchObject({
      ok: false,
      message: "Reports are taken only for active projects.",
    });
    use({ execute: fileable({ project: [{ status: "declined" }] }) });
    expect(await fileReport(caller(MEMBER), input(), NOW)).toMatchObject({
      ok: false,
      message: expect.stringContaining("predates"),
    });
    use({ execute: fileable({ project: [] }) });
    expect(await fileReport(caller(MEMBER), input(), NOW)).toMatchObject({
      ok: false,
      message: "That project was not found.",
    });
  });
});

describe("what a report must hold", () => {
  const bad: [string, Record<string, unknown>][] = [
    ["content", { content: words(99) }],
    ["shas", { shas: [] }],
    ["hours", { hours: 0.1 }],
    ["endDate", { endDate: "2026-10-25" }],
    ["endDate", { startDate: "2026-10-15" }],
  ];
  it.each(bad)(
    "refuses a bad %s before touching the database",
    async (field, over) => {
      use({ execute: fileable() });
      const result = await fileReport(caller(MEMBER), input(over), NOW);
      expect(result).toMatchObject({
        ok: false,
        fieldErrors: { [field]: expect.any(String) },
      });
      expect(fake.calls).toHaveLength(0);
    },
  );

  it("refuses a malformed SHA", async () => {
    use({ execute: fileable() });
    expect(
      await fileReport(caller(MEMBER), input({ shas: ["abc123"] }), NOW),
    ).toMatchObject({ ok: false, fieldErrors: { shas: expect.any(String) } });
  });

  it("refuses a commit that is not the member's own, in the project's repos, in range", async () => {
    use({ execute: fileable({ eligible: [] }) });
    const result = await fileReport(caller(MEMBER), input(), NOW);
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { shas: expect.stringContaining(SHA.slice(0, 7)) },
    });
    expect(fake.writes("insert", "projectReports")).toHaveLength(0);
  });

  it("asks the database for the member's own commits, in range, from approved repos", async () => {
    use({ execute: fileable() });
    await fileReport(caller(MEMBER), input(), NOW);
    const [eligible] = fake.ran("distinct on (c.sha)");
    expect(eligible!.text).toContain(`pr.approval = 'approved'`);
    expect(eligible!.text).toContain(`c."userId"`);
    expect(eligible!.text).toContain("America/New_York");
    expect(eligible!.params).toEqual(
      expect.arrayContaining([MEMBER, PROJECT, "2026-10-01", "2026-10-14"]),
    );
  });
});

describe("a commit backs one report", () => {
  it("names the commit another report already cites", async () => {
    use({
      execute: fileable({
        taken: [{ sha: SHA, message: "Add the feed\n\nBody" }],
      }),
    });
    const result = await fileReport(caller(MEMBER), input(), NOW);
    expect(result).toMatchObject({
      ok: false,
      message: commitTakenMessage(SHA, "Add the feed"),
    });
    expect((result as { message: string }).message).toContain(
      `Commit ${SHA.slice(0, 7)} "Add the feed"`,
    );
    expect(fake.writes("insert", "projectReports")).toHaveLength(0);
  });

  it("turns projectReportCommits_sha_key into the same friendly sentence", async () => {
    use({
      execute: [
        ...fileable(),
        [
          "select message from platform.commits",
          [{ message: "Fix the login" }],
        ],
      ],
      failInsert: Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint_name: "projectReportCommits_sha_key",
        detail: `Key (sha)=(${SHA}) already exists.`,
      }),
    });
    expect(await fileReport(caller(MEMBER), input(), NOW)).toMatchObject({
      ok: false,
      message: expect.stringContaining(`"Fix the login" is already cited`),
      fieldErrors: { shas: expect.stringContaining(SHA.slice(0, 7)) },
    });
  });

  it("finds the commit itself when the driver gives no detail", async () => {
    use({
      execute: [
        ["select sha from platform", [{ sha: SHA }]],
        [
          "select message from platform.commits",
          [{ message: "Fix the login" }],
        ],
        ...fileable(),
      ],
      failInsert: Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint_name: "projectReportCommits_sha_key",
      }),
    });
    expect(await fileReport(caller(MEMBER), input(), NOW)).toMatchObject({
      ok: false,
      message: expect.stringContaining(`"Fix the login"`),
    });
  });

  it("pre-checks against other reports only: an edit keeps its own commits", async () => {
    use({
      report: { status: "returned", projectId: PROJECT, authorId: MEMBER },
      execute: fileable(),
    });
    await fileReport(caller(MEMBER), input({ reportId: REPORT }), NOW);
    expect(fake.ran("where pc.sha in")[0]!.params).toContain(REPORT);
  });
});

describe("editing a report", () => {
  const existing = (status: string, authorId = MEMBER) => ({
    status,
    projectId: PROJECT,
    authorId,
  });
  it("resubmits a returned report: the queue again, the review cleared, the commits replaced", async () => {
    use({
      report: existing("returned"),
      execute: fileable({ eligible: [{ sha: SHA2, repoId: "11" }] }),
    });
    const result = await fileReport(
      caller(MEMBER),
      input({ reportId: REPORT, shas: [SHA2] }),
      NOW,
    );
    expect(result).toMatchObject({ ok: true, data: { reportId: REPORT } });
    expect(fake.writes("update", "projectReports")[0]!.values).toMatchObject({
      status: "submitted",
      approvedHours: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
    });
    const text = fake.calls
      .filter((c) => c.kind === "execute")
      .map((c) => c.text);
    expect(
      text.findIndex((t) =>
        t?.includes('delete from platform."projectReportCommits"'),
      ),
    ).toBeLessThan(
      text.findIndex((t) =>
        t?.includes('insert into platform."projectReportCommits"'),
      ),
    );
  });
  it("edits one that is awaiting review", async () => {
    use({ report: existing("submitted"), execute: fileable() });
    expect(
      await fileReport(caller(MEMBER), input({ reportId: REPORT }), NOW),
    ).toMatchObject({ ok: true });
  });
  it("refuses an approved report", async () => {
    use({ report: existing("approved"), execute: fileable() });
    expect(
      await fileReport(caller(MEMBER), input({ reportId: REPORT }), NOW),
    ).toMatchObject({
      ok: false,
      message: "An approved report cannot be changed.",
    });
  });
  it("hides another member's report as not found", async () => {
    use({ report: existing("submitted", OTHER), execute: fileable() });
    expect(
      await fileReport(caller(MEMBER), input({ reportId: REPORT }), NOW),
    ).toMatchObject({ ok: false, message: "That report was not found." });
  });
  it("leaves a legacy report with PR evidence as it is", async () => {
    use({
      report: existing("returned"),
      execute: [["projectReportContributions", [{ x: 1 }]], ...fileable()],
    });
    expect(
      await fileReport(caller(MEMBER), input({ reportId: REPORT }), NOW),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("pull requests"),
    });
  });
});

describe("deleting a report", () => {
  it("is the author's, until it is approved", async () => {
    use({
      report: { status: "submitted", projectId: PROJECT, authorId: MEMBER },
    });
    expect(await deleteReport(caller(MEMBER), REPORT)).toMatchObject({
      ok: true,
    });
    expect(fake.writes("delete", "projectReports")).toHaveLength(1);
    use({
      report: { status: "approved", projectId: PROJECT, authorId: MEMBER },
    });
    expect(await deleteReport(caller(MEMBER), REPORT)).toMatchObject({
      ok: false,
      message: "An approved report cannot be deleted.",
    });
    use({
      report: { status: "submitted", projectId: PROJECT, authorId: OTHER },
    });
    expect(await deleteReport(caller(MEMBER), REPORT)).toMatchObject({
      ok: false,
      message: "That report was not found.",
    });
  });
});

describe("reviewing a report", () => {
  const report = (over: Record<string, unknown> = {}) =>
    [
      [
        "for update of r",
        [
          {
            userId: MEMBER,
            projectId: PROJECT,
            status: "submitted",
            hours: "6.50",
            advisorId: ADVISOR,
            ...over,
          },
        ],
      ],
    ] as [string, never[]][];
  const approve = (hours = 6) => ({ action: "approve", hours }) as const;

  it("lets the project's advisor approve, adjusting the hours", async () => {
    use({ execute: report() });
    expect(
      await reviewReport(caller(ADVISOR), REPORT, approve(5.5)),
    ).toMatchObject({
      ok: true,
      message: "Report approved.",
    });
    expect(fake.writes("update", "projectReports")[0]!.values).toMatchObject({
      status: "approved",
      approvedHours: "5.50",
      reviewedBy: ADVISOR,
    });
    expect(fake.audits()).toEqual(["projectReport.approved"]);
  });

  it("lets a holder of reviewProjectReports review any project's report", async () => {
    use({ execute: report() });
    expect(
      await reviewReport(
        caller(REVIEWER, { canReview: true }),
        REPORT,
        approve(),
      ),
    ).toMatchObject({ ok: true });
  });

  it("returns a report with a note", async () => {
    use({ execute: report() });
    expect(
      await reviewReport(caller(ADVISOR), REPORT, {
        action: "return",
        note: "  Cite more.  ",
      }),
    ).toMatchObject({ ok: true, message: "Report returned." });
    expect(fake.writes("update", "projectReports")[0]!.values).toMatchObject({
      status: "returned",
      reviewNote: "Cite more.",
      approvedHours: null,
    });
  });

  it("never lets anyone review their own report, advisor or holder alike", async () => {
    use({ execute: report({ advisorId: MEMBER }) });
    expect(await reviewReport(caller(MEMBER), REPORT, approve())).toMatchObject(
      {
        ok: false,
        message: "You cannot review your own report.",
      },
    );
    use({ execute: report() });
    expect(
      await reviewReport(
        caller(MEMBER, { canReview: true }),
        REPORT,
        approve(),
      ),
    ).toMatchObject({
      ok: false,
      message: "You cannot review your own report.",
    });
    expect(fake.writes("update", "projectReports")).toHaveLength(0);
  });

  it("turns away an officer who is neither the advisor nor a holder", async () => {
    use({ execute: report() });
    expect(
      await reviewReport(
        caller(OFFICER, { isLeader: true }),
        REPORT,
        approve(),
      ),
    ).toMatchObject({ ok: false, message: expect.stringContaining("advisor") });
  });

  it("turns away a stranger", async () => {
    use({ execute: report() });
    expect(await reviewReport(caller(OTHER), REPORT, approve())).toMatchObject({
      ok: false,
    });
  });

  it("reviews a report once", async () => {
    use({ execute: report({ status: "approved" }) });
    expect(
      await reviewReport(caller(ADVISOR), REPORT, approve()),
    ).toMatchObject({
      ok: false,
      message: "That report was already reviewed.",
    });
  });

  it("needs a note to return, and quarter hours to approve", async () => {
    use({ execute: report() });
    expect(
      await reviewReport(caller(ADVISOR), REPORT, {
        action: "return",
        note: "  ",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { note: expect.any(String) } });
    for (const hours of [0, 0.1, 201, Number.NaN]) {
      expect(
        await reviewReport(caller(ADVISOR), REPORT, approve(hours)),
      ).toMatchObject({
        ok: false,
        fieldErrors: { hours: expect.any(String) },
      });
    }
    expect(fake.calls).toHaveLength(0);
  });

  it("is not found for a missing report", async () => {
    use();
    expect(await reviewReport(caller(ADVISOR), REPORT, approve())).toEqual({
      ok: false,
      message: "That report was not found.",
    });
  });
});
