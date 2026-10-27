// @vitest-environment node
import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import { getElSummary } from "~/server/el/summary";
import { getEligiblePullRequests, getReviewQueue } from "./load";

/**
 * Projects, project reports and the EL evidence view against a real database
 * (D5; Q119, Q123, Q125, Q168, Q170): proposing and approving, who may manage
 * members and review reports, the one-report-per-pull-request rule, what the
 * evidence view counts as verified, and what account deletion does to every
 * new table. Fixture ids are all `d5...` and swept before and after each test.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const {
  addProjectMember,
  decideProject,
  deleteProjectReport,
  proposeProject,
  removeProjectMember,
  reviewProjectReport,
  setProjectAdvisor,
  submitProjectReport,
} = await import("./store");

const id = (n: number) =>
  `d5000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const MEMBER = id(1);
const OFFICER = id(2);
const ADVISOR = id(3);
const OTHER = id(4);
const ALL = [MEMBER, OFFICER, ADVISOR, OTHER] as const;
const ROLE = id(21);
const MEETING_A = id(11);
const MEETING_B = id(12);
const REPO = "DevDogsUGA/d5-dbtest";
const WS = "d5-ws";
const TODAY = new Date("2026-10-24T16:00:00.000Z");

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

async function cleanup() {
  const ids = sql.join(
    ALL.map((u) => sql`${u}::uuid`),
    sql`, `,
  );
  const meetings = sql`${MEETING_A}::uuid, ${MEETING_B}::uuid`;
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."projectReportContributions"
      where "reportId" in (
        select id from platform."projectReports"
        where "userId" in (${ids})
           or "projectId" in (select id from platform.projects where name like 'D5 %')
      )
    `);
    await tx.execute(sql`
      delete from platform."projectMembers"
      where "userId" in (${ids})
         or "projectId" in (select id from platform.projects where name like 'D5 %')
    `);
    await tx.execute(sql`
      delete from platform."projectReports"
      where "userId" in (${ids})
         or "projectId" in (select id from platform.projects where name like 'D5 %')
    `);
    await tx.execute(sql`delete from platform.projects where name like 'D5 %'`);
    await tx.execute(
      sql`delete from platform.contributions where repo like ${`${REPO}%`}`,
    );
    await tx.execute(sql`
      delete from platform."reflectionRevisions"
      where "userId" in (${ids}) or "meetingId" in (${meetings})
    `);
    await tx.execute(sql`
      delete from platform.reflections
      where "userId" in (${ids}) or "meetingId" in (${meetings})
    `);
    await tx.execute(sql`
      delete from platform.attendance
      where "userId" in (${ids}) or "meetingId" in (${meetings})
    `);
    await tx.execute(
      sql`delete from platform."badgeAwards" where "userId" in (${ids})`,
    );
    await tx.execute(
      sql`delete from platform.workshops where "meetingId" in (${meetings})`,
    );
    await tx.execute(
      sql`delete from platform.meetings where id in (${meetings})`,
    );
    await tx.execute(
      sql`delete from platform."auditEvents" where "actorUserId" in (${ids})`,
    );
  });
  await db.execute(sql`delete from platform.roles where id = ${ROLE}::uuid`);
  await deleteMembers(ALL);
}

beforeAll(cleanup);
afterAll(cleanup);

beforeEach(async () => {
  await cleanup();
  await insertMember({ id: MEMBER, handle: "d5-member" });
  await insertMember({ id: OFFICER, handle: "d5-officer" });
  await insertMember({ id: ADVISOR, handle: "d5-advisor" });
  await insertMember({ id: OTHER, handle: "d5-other" });
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "isLeadership")
    values (${ROLE}::uuid, 'D5 Test Officer', 9999.5, true)
  `);
  await db.execute(sql`
    insert into platform."userRoles" ("userId", "roleId")
    values (${OFFICER}::uuid, ${ROLE}::uuid)
  `);
});

async function activeProject(
  name = "D5 DogDays",
  members: string[] = [MEMBER],
): Promise<string> {
  const proposed = await proposeProject(MEMBER, {
    name,
    description: "A test project.",
    repos: REPO,
  });
  if (proposed.status !== "proposed") throw new Error("not proposed");
  const approved = await decideProject(OFFICER, proposed.projectId, {
    action: "approve",
    advisorId: ADVISOR,
  });
  if (approved.status !== "approved") throw new Error("not approved");
  for (const member of members) {
    if (member !== MEMBER) {
      await addProjectMember(ADVISOR, proposed.projectId, member);
    }
  }
  return proposed.projectId;
}

async function merge(
  userId: string,
  n: number,
  mergedAt = "2026-10-10T16:00:00Z",
  repo = REPO,
): Promise<string> {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into platform.contributions
      (repo, "prNumber", title, url, "mergedAt", "authorGithubId", "authorLogin", "userId")
    values (${repo}, ${n}, ${`PR ${n}`}, ${`https://github.com/${repo}/pull/${n}`},
            ${mergedAt}::timestamptz, ${`d5-gh-${userId.slice(-2)}`}, 'd5', ${userId}::uuid)
    returning id
  `);
  return row!.id;
}

const report = (projectId: string, over: Record<string, unknown> = {}) => ({
  projectId,
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  hours: 6.5,
  content: words(100),
  // A report must cite a PR (Q119); this stands in where the test is about
  // something that fails before the PRs are read.
  contributionIds: [id(96)],
  ...over,
});

let prCounter = 1000;
/** A report whose cited PR is real: merged by `userId` inside the range. */
async function cited(
  userId: string,
  projectId: string,
  over: Record<string, unknown> = {},
) {
  prCounter += 1;
  const pr = await merge(userId, prCounter);
  return report(projectId, { contributionIds: [pr], ...over });
}

async function auditActions(): Promise<string[]> {
  const rows = await db.execute<{ action: string }>(sql`
    select action from platform."auditEvents"
    where "actorUserId" in (${sql.join(
      ALL.map((u) => sql`${u}::uuid`),
      sql`, `,
    )}) and "targetType" in ('project', 'projectReport')
    order by "createdAt", id
  `);
  return rows.map((r) => r.action);
}

describe("proposing and approving a project (Q123)", () => {
  it("lets any member propose, makes them a member, and audits it", async () => {
    const result = await proposeProject(MEMBER, {
      name: "  D5   Study  Buddy ",
      description: "",
      repos:
        "https://github.com/DevDogsUGA/d5-dbtest.git, devdogsuga/D5-DBTEST",
    });
    expect(result.status).toBe("proposed");
    const [row] = await db.execute<{
      name: string;
      status: string;
      repos: string[];
      advisorId: string | null;
    }>(
      sql`select name, status, repos, "advisorId" from platform.projects where name like 'D5 %'`,
    );
    expect(row).toMatchObject({
      name: "D5 Study Buddy",
      status: "proposed",
      repos: ["DevDogsUGA/d5-dbtest"],
      advisorId: null,
    });
    const members = await db.execute(
      sql`select 1 from platform."projectMembers" where "userId" = ${MEMBER}::uuid`,
    );
    expect(members).toHaveLength(1);
    expect(await auditActions()).toEqual(["project.proposed"]);
  });

  it("refuses a bad name, a duplicate name, bad repos and a fourth open proposal", async () => {
    expect(
      await proposeProject(MEMBER, { name: "x", description: "", repos: "" }),
    ).toEqual({ status: "name_invalid" });
    expect(
      await proposeProject(MEMBER, {
        name: "D5 Repos",
        description: "",
        repos: "nope",
      }),
    ).toMatchObject({ status: "repos_invalid" });
    await proposeProject(MEMBER, {
      name: "D5 One",
      description: "",
      repos: "",
    });
    expect(
      await proposeProject(OTHER, {
        name: "d5 one",
        description: "",
        repos: "",
      }),
    ).toEqual({ status: "name_taken" });
    await proposeProject(MEMBER, {
      name: "D5 Two",
      description: "",
      repos: "",
    });
    await proposeProject(MEMBER, {
      name: "D5 Three",
      description: "",
      repos: "",
    });
    expect(
      await proposeProject(MEMBER, {
        name: "D5 Four",
        description: "",
        repos: "",
      }),
    ).toEqual({ status: "too_many_open" });
  });

  it("is decided by leadership alone, with an advisor, once", async () => {
    const proposed = await proposeProject(MEMBER, {
      name: "D5 Decide",
      description: "",
      repos: "",
    });
    if (proposed.status !== "proposed") throw new Error("not proposed");
    const approve = {
      action: "approve",
      advisorId: ADVISOR,
    } as const;
    expect(await decideProject(MEMBER, proposed.projectId, approve)).toEqual({
      status: "forbidden",
    });
    expect(
      await decideProject(OFFICER, proposed.projectId, {
        action: "approve",
        advisorId: id(99),
      }),
    ).toEqual({ status: "unknown_advisor" });
    expect(await decideProject(OFFICER, proposed.projectId, approve)).toEqual({
      status: "approved",
    });
    expect(await decideProject(OFFICER, proposed.projectId, approve)).toEqual({
      status: "not_proposed",
    });
    const [row] = await db.execute<{
      status: string;
      advisorId: string;
      approvedBy: string;
    }>(
      sql`select status, "advisorId", "approvedBy" from platform.projects where id = ${proposed.projectId}::uuid`,
    );
    expect(row).toEqual({
      status: "active",
      advisorId: ADVISOR,
      approvedBy: OFFICER,
    });
    expect(await auditActions()).toEqual([
      "project.proposed",
      "project.approved",
    ]);
  });

  it("declines a proposal, and lets leadership replace the advisor", async () => {
    const proposed = await proposeProject(MEMBER, {
      name: "D5 Declined",
      description: "",
      repos: "",
    });
    if (proposed.status !== "proposed") throw new Error("not proposed");
    expect(
      await decideProject(OFFICER, proposed.projectId, { action: "decline" }),
    ).toEqual({ status: "declined" });
    const project = await activeProject("D5 Active");
    expect(await setProjectAdvisor(ADVISOR, project, OTHER)).toEqual({
      status: "forbidden",
    });
    expect(await setProjectAdvisor(OFFICER, project, OTHER)).toEqual({
      status: "advisor_set",
    });
  });
});

describe("keeping the member list", () => {
  it("is the advisor's or leadership's, never a member's", async () => {
    const project = await activeProject();
    expect(await addProjectMember(OTHER, project, OTHER)).toEqual({
      status: "forbidden",
    });
    expect(await addProjectMember(MEMBER, project, OTHER)).toEqual({
      status: "forbidden",
    });
    expect(await addProjectMember(ADVISOR, project, id(99))).toEqual({
      status: "unknown_member",
    });
    expect(await addProjectMember(ADVISOR, project, OTHER)).toEqual({
      status: "ok",
    });
    // Adding twice is quiet and writes one audit row.
    await addProjectMember(OFFICER, project, OTHER);
    expect(
      (await auditActions()).filter((a) => a === "project.member_added"),
    ).toHaveLength(1);
    expect(await removeProjectMember(ADVISOR, project, OTHER)).toEqual({
      status: "ok",
    });
  });
});

describe("project reports (Q119-Q121)", () => {
  it("needs a member of an active project", async () => {
    const project = await activeProject();
    expect(await submitProjectReport(OTHER, report(project), TODAY)).toEqual({
      status: "not_member",
    });
    expect(await submitProjectReport(MEMBER, report(id(98)), TODAY)).toEqual({
      status: "not_found",
    });
  });

  it("takes 100 words, a sane range and quarter hours, in code and in the database", async () => {
    const project = await activeProject();
    expect(
      await submitProjectReport(
        MEMBER,
        report(project, { content: words(99) }),
        TODAY,
      ),
    ).toEqual({ status: "invalid", problem: "too_short" });
    expect(
      await submitProjectReport(
        MEMBER,
        report(project, { endDate: "2026-10-25" }),
        TODAY,
      ),
    ).toEqual({ status: "invalid", problem: "future" });
    expect(
      await submitProjectReport(MEMBER, report(project, { hours: 1.1 }), TODAY),
    ).toEqual({ status: "invalid", problem: "bad_hours" });
    // The database holds the line too, whatever the server does.
    await expect(
      db.execute(sql`
        insert into platform."projectReports" ("userId", "projectId", "startDate", "endDate", hours, content)
        values (${MEMBER}::uuid, ${project}::uuid, '2026-10-01', '2026-10-02', 1, ${words(99)})
      `),
    ).rejects.toThrow();
  });

  it("refuses a report that cites no pull request (Q119, Q120)", async () => {
    const project = await activeProject();
    expect(
      await submitProjectReport(
        MEMBER,
        report(project, { contributionIds: [] }),
        TODAY,
      ),
    ).toEqual({ status: "invalid", problem: "no_prs" });
    const n = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform."projectReports" where "userId" = ${MEMBER}::uuid`,
    );
    expect(n[0]!.n).toBe(0);
  });

  it("keeps leadership out of ordinary reports; their EL is separate (Q125)", async () => {
    const project = await activeProject("D5 Officer", [MEMBER, OFFICER]);
    expect(
      await submitProjectReport(OFFICER, await cited(OFFICER, project), TODAY),
    ).toEqual({ status: "leadership_separate" });
    const n = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform."projectReports" where "userId" = ${OFFICER}::uuid`,
    );
    expect(n[0]!.n).toBe(0);
  });

  it("counts words the way the app does, NBSP included", async () => {
    const nbsp = Array.from({ length: 100 }, () => "word").join("\u00a0");
    const [row] = await db.execute<{ n: number; blank: number }>(
      sql`select platform.word_count(${nbsp}) as n, platform.word_count(${"\u00a0 \n"}) as blank`,
    );
    expect(row).toEqual({ n: 100, blank: 0 });
    const project = await activeProject("D5 Nbsp");
    const sent = await submitProjectReport(
      MEMBER,
      await cited(MEMBER, project, { content: nbsp }),
      TODAY,
    );
    expect(sent.status).toBe("submitted");
  });

  it("keeps the picker's PRs past the first 200 older ones", async () => {
    await activeProject("D5 Picker");
    const mine = await merge(MEMBER, 1, "2026-10-01T16:00:00Z");
    await db.execute(sql`
      insert into platform.contributions
        (repo, "prNumber", title, url, "mergedAt", "authorGithubId", "authorLogin", "userId")
      select ${`${REPO}-other`}, n, 'x', 'https://github.com/x/y/pull/' || n,
             '2026-10-12T16:00:00Z'::timestamptz + make_interval(mins => n),
             'd5-gh-bulk', 'd5', ${MEMBER}::uuid
      from generate_series(1, 210) n
    `);
    const eligible = await getEligiblePullRequests(
      MEMBER,
      { repos: [REPO] },
      null,
    );
    expect(eligible.map((p) => p.id)).toEqual([mine]);
  });

  it("cites only the author's own PRs, merged in the range, in the project's repositories", async () => {
    const project = await activeProject();
    const inRange = await merge(MEMBER, 1);
    const early = await merge(MEMBER, 2, "2026-09-01T16:00:00Z");
    const theirs = await merge(OTHER, 3);
    const elsewhere = await merge(
      MEMBER,
      4,
      "2026-10-10T16:00:00Z",
      `${REPO}-other`,
    );
    const submit = (contributionIds: string[]) =>
      submitProjectReport(MEMBER, report(project, { contributionIds }), TODAY);
    expect(await submit([theirs])).toEqual({ status: "pr_not_yours" });
    expect(await submit([early])).toEqual({ status: "pr_out_of_range" });
    expect(await submit([elsewhere])).toEqual({ status: "pr_wrong_repo" });
    expect(await submit([id(97)])).toEqual({ status: "pr_not_yours" });
    const ok = await submit([inRange, inRange]);
    expect(ok.status).toBe("submitted");
  });

  it("lets each PR back at most one report, and frees it when the report goes", async () => {
    const project = await activeProject();
    const pr = await merge(MEMBER, 1);
    const first = await submitProjectReport(
      MEMBER,
      report(project, { contributionIds: [pr] }),
      TODAY,
    );
    if (first.status !== "submitted") throw new Error("not submitted");
    expect(
      await submitProjectReport(
        MEMBER,
        report(project, { contributionIds: [pr] }),
        TODAY,
      ),
    ).toEqual({ status: "pr_already_used" });
    // The picker offers it only to the report that holds it.
    const forNew = await getEligiblePullRequests(
      MEMBER,
      { repos: [REPO] },
      null,
    );
    expect(forNew).toEqual([]);
    const forEdit = await getEligiblePullRequests(
      MEMBER,
      { repos: [REPO] },
      first.reportId,
    );
    expect(forEdit.map((p) => [p.id, p.selected])).toEqual([[pr, true]]);

    expect(await deleteProjectReport(MEMBER, first.reportId)).toBe("deleted");
    const second = await submitProjectReport(
      MEMBER,
      report(project, { contributionIds: [pr] }),
      TODAY,
    );
    expect(second.status).toBe("submitted");
  });
});

describe("reviewing a report (Q119, Q125)", () => {
  async function submitted(projectMembers: string[] = [MEMBER]) {
    const project = await activeProject("D5 Review", projectMembers);
    const sent = await submitProjectReport(
      MEMBER,
      await cited(MEMBER, project),
      TODAY,
    );
    if (sent.status !== "submitted") throw new Error("not submitted");
    return { project, reportId: sent.reportId };
  }

  it("is the advisor's or leadership's, never the author's own", async () => {
    const { reportId } = await submitted();
    const approve = { action: "approve", hours: 6 } as const;
    expect(await reviewProjectReport(OTHER, reportId, approve)).toEqual({
      status: "forbidden",
    });
    expect(await reviewProjectReport(MEMBER, reportId, approve)).toEqual({
      status: "forbidden",
    });
    expect(await reviewProjectReport(ADVISOR, reportId, approve)).toEqual({
      status: "approved",
      authorId: MEMBER,
    });
  });

  it("refuses a reviewer's own report even when they are the advisor or leadership", async () => {
    const project = await activeProject("D5 Own", [MEMBER, ADVISOR]);
    const own = await submitProjectReport(
      ADVISOR,
      await cited(ADVISOR, project),
      TODAY,
    );
    if (own.status !== "submitted") throw new Error("not submitted");
    expect(
      await reviewProjectReport(ADVISOR, own.reportId, {
        action: "approve",
        hours: 6,
      }),
    ).toEqual({ status: "own_report" });
    const queue = await getReviewQueue(ADVISOR, false);
    expect(queue.map((r) => r.id)).not.toContain(own.reportId);
    // Leadership can review it.
    expect((await getReviewQueue(OFFICER, true)).map((r) => r.id)).toContain(
      own.reportId,
    );
  });

  it("approves with adjusted hours, which are what the evidence counts", async () => {
    const { project, reportId } = await submitted();
    expect(
      await reviewProjectReport(ADVISOR, reportId, {
        action: "approve",
        hours: 0,
      }),
    ).toEqual({ status: "bad_hours" });
    expect(
      await reviewProjectReport(OFFICER, reportId, {
        action: "approve",
        hours: 5.25,
      }),
    ).toEqual({ status: "approved", authorId: MEMBER });
    expect(
      await reviewProjectReport(OFFICER, reportId, {
        action: "approve",
        hours: 5,
      }),
    ).toEqual({ status: "already_reviewed" });
    const evidence = await db.execute<{
      evidenceType: string;
      hours: string;
    }>(
      sql`select "evidenceType", hours::text from platform."memberElEvidence" where "userId" = ${MEMBER}::uuid`,
    );
    expect(evidence).toEqual([
      { evidenceType: "project_report", hours: "5.25" },
    ]);
    expect(await getElSummary(MEMBER)).toMatchObject({
      projectHours: 5.25,
      totalHours: 5.25,
    });
    // An approved report is locked and cannot be withdrawn.
    expect(
      await submitProjectReport(
        MEMBER,
        { ...report(project), reportId },
        TODAY,
      ),
    ).toEqual({ status: "locked" });
    expect(await deleteProjectReport(MEMBER, reportId)).toBe("locked");
    expect(await auditActions()).toContain("projectReport.approved");
  });

  it("returns with a note, counts for nothing, and takes a resubmission", async () => {
    const { project, reportId } = await submitted();
    expect(
      await reviewProjectReport(ADVISOR, reportId, {
        action: "return",
        note: " ",
      }),
    ).toEqual({ status: "note_required" });
    expect(
      await reviewProjectReport(ADVISOR, reportId, {
        action: "return",
        note: "Say what you built.",
      }),
    ).toEqual({ status: "returned", authorId: MEMBER });
    expect(await getElSummary(MEMBER)).toMatchObject({ totalHours: 0 });

    const again = await submitProjectReport(
      MEMBER,
      { ...(await cited(MEMBER, project, { hours: 7 })), reportId },
      TODAY,
    );
    expect(again).toEqual({ status: "submitted", reportId });
    const [row] = await db.execute<{
      status: string;
      approvedHours: string | null;
      reviewedAt: Date | null;
      hours: string;
    }>(
      sql`select status, "approvedHours", "reviewedAt", hours::text from platform."projectReports" where id = ${reportId}::uuid`,
    );
    expect(row).toMatchObject({
      status: "submitted",
      approvedHours: null,
      reviewedAt: null,
      hours: "7.00",
    });
  });
});

describe("the EL evidence view (Q28, Q109, Q171)", () => {
  async function workshopNight(
    meetingId: string,
    daysAgo: number,
    elHours = 0.5,
  ) {
    await db.execute(sql`
      insert into platform.meetings (id, slug, "startsAt", "endsAt")
      values (${meetingId}::uuid, ${`d5-${meetingId.slice(-2)}`},
              now() - make_interval(days => ${daysAgo}),
              now() - make_interval(days => ${daysAgo}) + interval '2 hours')
    `);
    await db.execute(sql`
      insert into platform.workshops ("meetingId", "definitionId", "elHours")
      values (${meetingId}::uuid, ${WS}, ${elHours})
    `);
    await db.execute(sql`
      insert into platform.attendance ("userId", "meetingId", method, "recordedAt")
      values (${MEMBER}::uuid, ${meetingId}::uuid, 'qr',
              now() - make_interval(days => ${daysAgo}))
    `);
  }
  async function reflect(
    meetingId: string,
    content: string,
    submittedDaysAgo: number | null,
  ) {
    await db.execute(sql`
      insert into platform.reflections ("userId", "meetingId", content, "submittedAt", "workshopDefinitionId")
      values (${MEMBER}::uuid, ${meetingId}::uuid, ${content},
              ${submittedDaysAgo === null ? sql`null` : sql`now() - make_interval(days => ${submittedDaysAgo})`},
              ${WS})
    `);
  }
  const evidence = () =>
    db.execute<{ evidenceType: string; hours: string; words: number }>(sql`
      select "evidenceType", hours::text, words from platform."memberElEvidence"
      where "userId" = ${MEMBER}::uuid order by "activityOn"
    `);

  it("counts a workshop with a 100-word reflection inside the window, at its elHours", async () => {
    await workshopNight(MEETING_A, 3, 0.5);
    await reflect(MEETING_A, words(100), 2);
    expect(await evidence()).toEqual([
      { evidenceType: "workshop", hours: "0.50", words: 100 },
    ]);
    expect(await getElSummary(MEMBER)).toMatchObject({
      workshopsAttended: 1,
      workshopsVerified: 1,
      workshopHours: 0.5,
      totalHours: 0.5,
    });
  });

  it("does not count 99 words, a draft, a missing attendance, or a late reflection", async () => {
    await workshopNight(MEETING_A, 3);
    await reflect(MEETING_A, words(99), 2);
    expect(await evidence()).toEqual([]);
    await db.execute(
      sql`update platform.reflections set content = ${words(100)}, "submittedAt" = null where "userId" = ${MEMBER}::uuid`,
    );
    expect(await evidence()).toEqual([]);
    // Submitted nine days after attendance was recorded: outside one week.
    await db.execute(
      sql`update platform.reflections set "submittedAt" = now() + interval '9 days' where "userId" = ${MEMBER}::uuid`,
    );
    expect(await evidence()).toEqual([]);
    // Attended but never reflected still counts as attended, not verified.
    expect(await getElSummary(MEMBER)).toMatchObject({
      workshopsAttended: 1,
      workshopsVerified: 0,
      totalHours: 0,
    });
    await db.execute(
      sql`delete from platform.attendance where "userId" = ${MEMBER}::uuid`,
    );
    await db.execute(
      sql`update platform.reflections set "submittedAt" = now()`,
    );
    expect(await evidence()).toEqual([]);
  });

  it("keeps the window at one week even if the setting says one day", async () => {
    await workshopNight(MEETING_A, 4);
    await reflect(MEETING_A, words(100), 1);
    await db.execute(
      sql`update platform."reflectionSettings" set "submissionWindowDays" = 1`,
    );
    try {
      expect(await evidence()).toHaveLength(1);
    } finally {
      await db.execute(
        sql`update platform."reflectionSettings" set "submissionWindowDays" = 7`,
      );
    }
  });

  it("counts NBSP-separated words", async () => {
    await workshopNight(MEETING_A, 3);
    await reflect(
      MEETING_A,
      Array.from({ length: 100 }, () => "word").join("\u00a0"),
      2,
    );
    expect(await evidence()).toHaveLength(1);
  });

  it("counts a workshop once even when it ran on two nights", async () => {
    await workshopNight(MEETING_A, 6);
    await workshopNight(MEETING_B, 3);
    await reflect(MEETING_A, words(100), 5);
    await reflect(MEETING_B, words(100), 2);
    expect(await evidence()).toHaveLength(1);
    expect(await getElSummary(MEMBER)).toMatchObject({
      workshopsAttended: 1,
      workshopsVerified: 1,
    });
  });
});

describe("account deletion (Q168)", () => {
  it("deletes the member's reports, memberships and PR links, and frees the PRs", async () => {
    const project = await activeProject("D5 Delete", [MEMBER, OTHER]);
    const pr = await merge(MEMBER, 1);
    const sent = await submitProjectReport(
      MEMBER,
      report(project, { contributionIds: [pr] }),
      TODAY,
    );
    const theirs = await submitProjectReport(
      OTHER,
      await cited(OTHER, project),
      TODAY,
    );
    if (sent.status !== "submitted" || theirs.status !== "submitted") {
      throw new Error("not submitted");
    }
    await deleteMembers([MEMBER]);

    const count = async (query: ReturnType<typeof sql>) =>
      (await db.execute(query)).length;
    expect(
      await count(
        sql`select 1 from platform."projectReports" where id = ${sent.reportId}::uuid`,
      ),
    ).toBe(0);
    expect(
      await count(
        sql`select 1 from platform."projectReportContributions" where "reportId" = ${sent.reportId}::uuid`,
      ),
    ).toBe(0);
    expect(
      await count(
        sql`select 1 from platform."projectMembers" where "userId" = ${MEMBER}::uuid`,
      ),
    ).toBe(0);
    // Other members' work is untouched, and the project stays.
    expect(
      await count(
        sql`select 1 from platform."projectReports" where id = ${theirs.reportId}::uuid`,
      ),
    ).toBe(1);
    expect(
      await count(
        sql`select 1 from platform."projectMembers" where "projectId" = ${project}::uuid and "userId" = ${OTHER}::uuid`,
      ),
    ).toBe(1);
    const [row] = await db.execute<{ proposedBy: string | null }>(
      sql`select "proposedBy" from platform.projects where id = ${project}::uuid`,
    );
    expect(row?.proposedBy).toBeNull();
  });

  it("leaves a project without an advisor when its advisor is deleted, not without a record", async () => {
    const project = await activeProject("D5 Advisorless");
    const sent = await submitProjectReport(
      MEMBER,
      await cited(MEMBER, project),
      TODAY,
    );
    if (sent.status !== "submitted") throw new Error("not submitted");
    await reviewProjectReport(ADVISOR, sent.reportId, {
      action: "approve",
      hours: 6,
    });
    await deleteMembers([ADVISOR]);

    const [row] = await db.execute<{
      status: string;
      advisorId: string | null;
      name: string;
    }>(
      sql`select status, "advisorId", name from platform.projects where id = ${project}::uuid`,
    );
    expect(row).toEqual({
      status: "active",
      advisorId: null,
      name: "D5 Advisorless",
    });
    // The approved report stays, with no reviewer to name, and leadership can
    // appoint a new advisor.
    const [kept] = await db.execute<{
      status: string;
      reviewedBy: string | null;
    }>(
      sql`select status, "reviewedBy" from platform."projectReports" where id = ${sent.reportId}::uuid`,
    );
    expect(kept).toEqual({ status: "approved", reviewedBy: null });
    expect(await setProjectAdvisor(OFFICER, project, OTHER)).toEqual({
      status: "advisor_set",
    });
  });

  it("keeps the evidence view empty for a deleted member", async () => {
    const project = await activeProject("D5 Evidence");
    const sent = await submitProjectReport(
      MEMBER,
      await cited(MEMBER, project),
      TODAY,
    );
    if (sent.status !== "submitted") throw new Error("not submitted");
    await reviewProjectReport(ADVISOR, sent.reportId, {
      action: "approve",
      hours: 6,
    });
    await deleteMembers([MEMBER]);
    const rows = await db.execute(
      sql`select 1 from platform."memberElEvidence" where "userId" = ${MEMBER}::uuid`,
    );
    expect(rows).toHaveLength(0);
  });
});
