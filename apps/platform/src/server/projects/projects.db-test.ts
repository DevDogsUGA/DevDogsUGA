// @vitest-environment node
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- asymmetric matchers (expect.any, stringContaining) are typed any */
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
import { callerFor } from "~/server/auth/access";
import { db } from "~/server/db";
import { getElSummary } from "~/server/el/summary";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";

/**
 * The project store and the report writes against a real database (D3):
 * creating a project from proved repos, Owners, edits, lifecycle, the guard
 * triggers behind the pre-checks, filing and reviewing EL reports with commit
 * evidence, the one-report-per-commit rule under concurrency, the EL evidence
 * view, and what account deletion does. The GitHub control check is the one
 * thing faked; everything else is the real code on the real schema. Fixture
 * ids are all `d3...` and swept before and after each test.
 */

const control = vi.hoisted(() => ({ resolveControlledRepo: vi.fn() }));
vi.mock("~/server/github/control", () => control);

const {
  addOwner,
  archiveProject,
  createProject,
  decideRepoLink,
  deleteProject,
  linkRepo,
  makeDevdogsOwned,
  removeOwner,
  setAdvisor,
  unarchiveProject,
  unlinkRepo,
  updateProject,
} = await import("./store");
const { deleteReport, fileReport, reviewReport } = await import("./reports");

const id = (n: number) =>
  `d3000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const MEMBER = id(1);
const OFFICER = id(2);
const ADVISOR = id(3);
const OTHER = id(4);
const REVIEWER = id(5);
const UNLINKED = id(6);
const ALL = [MEMBER, OFFICER, ADVISOR, OTHER, REVIEWER, UNLINKED] as const;
const OFFICER_ROLE = id(21);
const REVIEWER_ROLE = id(22);
const MEETING_A = id(11);
const MEETING_B = id(12);
const REPO0 = 93_000_000;
const WS = "d3-ws";
const TODAY = new Date("2026-10-24T16:00:00.000Z");

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const sha = (n: number) => `d3${n.toString(16).padStart(38, "0")}`;
const as = (userId: string) => callerFor(userId);

async function cleanup() {
  const ids = sql.join(
    ALL.map((u) => sql`${u}::uuid`),
    sql`, `,
  );
  const meetings = sql`${MEETING_A}::uuid, ${MEETING_B}::uuid`;
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."projectReportCommits"
      where "reportId" in (
        select id from platform."projectReports"
        where "userId" in (${ids})
           or "projectId" in (select id from platform.projects where name like 'D3 %'))`);
    await tx.execute(sql`
      delete from platform."projectReports"
      where "userId" in (${ids})
         or "projectId" in (select id from platform.projects where name like 'D3 %')`);
    await tx.execute(sql`
      delete from platform."projectOwners"
      where "projectId" in (select id from platform.projects where name like 'D3 %')`);
    await tx.execute(sql`
      delete from platform."projectRepos"
      where "projectId" in (select id from platform.projects where name like 'D3 %')`);
    await tx.execute(sql`delete from platform.projects where name like 'D3 %'`);
    await tx.execute(
      sql`delete from platform."repoCommits" where sha like 'd3%'`,
    );
    await tx.execute(sql`delete from platform.commits where sha like 'd3%'`);
    await tx.execute(sql`
      delete from platform."repoSyncState"
      where "githubRepoId" between ${REPO0} and ${REPO0 + 99}`);
    await tx.execute(sql`
      delete from platform."githubRepos"
      where "githubRepoId" between ${REPO0} and ${REPO0 + 99}`);
    await tx.execute(sql`
      delete from platform."reflectionRevisions"
      where "userId" in (${ids}) or "meetingId" in (${meetings})`);
    await tx.execute(sql`
      delete from platform.reflections
      where "userId" in (${ids}) or "meetingId" in (${meetings})`);
    await tx.execute(sql`
      delete from platform.attendance
      where "userId" in (${ids}) or "meetingId" in (${meetings})`);
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
  await db.execute(
    sql`delete from platform.roles where id in (${OFFICER_ROLE}::uuid, ${REVIEWER_ROLE}::uuid)`,
  );
  await deleteMembers(ALL);
}

beforeAll(cleanup);
afterAll(cleanup);

beforeEach(async () => {
  vi.resetAllMocks();
  await cleanup();
  await insertMember({ id: MEMBER, handle: "d3-member" });
  await insertMember({ id: OFFICER, handle: "d3-officer" });
  await insertMember({ id: ADVISOR, handle: "d3-advisor" });
  await insertMember({ id: OTHER, handle: "d3-other" });
  await insertMember({ id: REVIEWER, handle: "d3-reviewer" });
  await insertMember({ id: UNLINKED, handle: "d3-unlinked", github: null });
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "isLeadership")
    values (${OFFICER_ROLE}::uuid, 'D3 Test Officer', 9999.5, true)`);
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "isLeadership", "canReviewProjectReports")
    values (${REVIEWER_ROLE}::uuid, 'D3 Test Reviewer', 9999.6, false, true)`);
  await db.execute(sql`
    insert into platform."userRoles" ("userId", "roleId") values
      (${OFFICER}::uuid, ${OFFICER_ROLE}::uuid),
      (${REVIEWER}::uuid, ${REVIEWER_ROLE}::uuid)`);
});

// ── Fixtures ────────────────────────────────────────────────────────────────

async function repo(n: number, ownerType: "User" | "Organization" = "User") {
  await db.execute(sql`
    insert into platform."githubRepos" ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch")
    values (${REPO0 + n}, ${3000 + n}, ${`d3owner${n}`}, ${`repo-${n}`}, ${ownerType}, 'main')
    on conflict do nothing`);
  return REPO0 + n;
}

/** What `resolveControlledRepo` returns for repo `n`, in the shape `saveRepo` takes. */
function proved(
  n: number,
  approval: "approved" | "pending",
  basis: "personal" | "devdogs-write" | "officer",
) {
  return {
    ok: true,
    data: {
      approval,
      basis,
      repo: {
        id: REPO0 + n,
        name: `repo-${n}`,
        private: false,
        owner: {
          id: 3000 + n,
          login: `d3owner${n}`,
          type: basis === "personal" ? "User" : "Organization",
        },
        default_branch: "main",
      },
    },
  };
}

async function project(
  name: string,
  opts: {
    status?: "active" | "archived";
    repos?: number[];
    owners?: string[];
    devdogsOwned?: boolean;
    advisor?: string | null;
    pending?: number[];
  } = {},
): Promise<string> {
  const { status = "active", repos = [1], owners = [MEMBER] } = opts;
  const [row] = await db.execute<{ id: string }>(sql`
    insert into platform.projects (name, slug, status, "advisorId", "devdogsOwned")
    values (${name}, ${name.toLowerCase().replace(/\s+/gu, "-")}, ${status},
      ${opts.advisor ?? null}::uuid, ${opts.devdogsOwned ?? false})
    returning id`);
  const projectId = row!.id;
  for (const n of repos) {
    await repo(n);
    await db.execute(sql`
      insert into platform."projectRepos"
        ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt")
      values (${projectId}::uuid, ${REPO0 + n}, 'approved', 'personal', ${3000 + n}, now())`);
  }
  for (const n of opts.pending ?? []) {
    await repo(n, "Organization");
    await db.execute(sql`
      insert into platform."projectRepos"
        ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId")
      values (${projectId}::uuid, ${REPO0 + n}, 'pending', 'officer', ${3000 + n})`);
  }
  for (const owner of owners) {
    await db.execute(sql`
      insert into platform."projectOwners" ("projectId", "userId")
      values (${projectId}::uuid, ${owner}::uuid)`);
  }
  return projectId;
}

/** A stored commit of `userId` on repo `n`, with the provenance row the sync writes. */
async function commit(
  userId: string,
  n: number,
  at: string,
  shaN: number,
  message = `Commit ${shaN}`,
) {
  await repo(n);
  await db.execute(sql`
    insert into platform.commits (sha, "githubRepoId", "authorGithubId", "authorLogin", "userId", "committedAt", message)
    values (${sha(shaN)}, ${REPO0 + n}, 3000, 'd3', ${userId}::uuid, ${at}::timestamptz, ${message})`);
  await db.execute(sql`
    insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch")
    values (${REPO0 + n}, ${sha(shaN)}, 'main')`);
  return sha(shaN);
}

const input = (projectId: string, over: Record<string, unknown> = {}) => ({
  projectId,
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  hours: 6.5,
  content: words(100),
  shas: [sha(1)],
  ...over,
});

async function filed(
  userId: string,
  projectId: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  const result = await fileReport(
    await as(userId),
    input(projectId, over),
    TODAY,
  );
  if (!result.ok) throw new Error(result.message);
  return result.data!.reportId;
}

async function audits(): Promise<string[]> {
  const rows = await db.execute<{ action: string }>(sql`
    select action from platform."auditEvents"
    where "actorUserId" in (${sql.join(
      ALL.map((u) => sql`${u}::uuid`),
      sql`, `,
    )}) and "targetType" in ('project', 'projectReport')
    order by "createdAt", id`);
  return rows.map((r) => r.action);
}

const rows = <T extends Record<string, unknown>>(
  query: ReturnType<typeof sql>,
) => db.execute<T>(query);

// ── Creating a project ──────────────────────────────────────────────────────

describe("creating a project", () => {
  const form = (name: string, repos = "d3owner1/repo-1") => ({
    name,
    description: "A test project.",
    tags: "web, Web, mobile",
    repos,
  });

  it("is active with a personal repo: one transaction writes project, owner, link and audit", async () => {
    control.resolveControlledRepo.mockResolvedValue(
      proved(1, "approved", "personal"),
    );
    const result = await createProject(await as(MEMBER), form("D3 Alpha"));
    expect(result).toMatchObject({
      ok: true,
      data: { slug: "d3-alpha", status: "active", pending: 0 },
    });
    const projectId = result.ok ? result.data!.projectId : "";
    const [created] = await rows<{
      status: string;
      tags: string[];
      slug: string;
    }>(
      sql`select status, tags, slug from platform.projects where id = ${projectId}::uuid`,
    );
    expect(created).toEqual({
      status: "active",
      tags: ["web", "mobile"],
      slug: "d3-alpha",
    });
    expect(
      await rows(
        sql`select 1 from platform."projectOwners" where "projectId" = ${projectId}::uuid and "userId" = ${MEMBER}::uuid`,
      ),
    ).toHaveLength(1);
    const [link] = await rows<{
      approval: string;
      approvalBasis: string;
      decidedAt: Date | null;
    }>(
      sql`select approval, "approvalBasis", "decidedAt" from platform."projectRepos" where "projectId" = ${projectId}::uuid`,
    );
    expect(link).toMatchObject({
      approval: "approved",
      approvalBasis: "personal",
    });
    expect(link!.decidedAt).not.toBeNull();
    expect(await audits()).toEqual(["project.created"]);
  });

  it("stays archived with a pending link when the only repo is in another org", async () => {
    control.resolveControlledRepo.mockResolvedValue(
      proved(2, "pending", "officer"),
    );
    const result = await createProject(
      await as(MEMBER),
      form("D3 Pending", "acme/repo-2"),
    );
    expect(result).toMatchObject({
      ok: true,
      data: { status: "archived", pending: 1 },
    });
    const projectId = result.ok ? result.data!.projectId : "";
    const [link] = await rows<{ approval: string; decidedAt: Date | null }>(
      sql`select approval, "decidedAt" from platform."projectRepos" where "projectId" = ${projectId}::uuid`,
    );
    expect(link).toEqual({ approval: "pending", decidedAt: null });
    // Pending confers no contributor rights, and un-archiving needs an approved link.
    expect(await unarchiveProject(await as(MEMBER), projectId)).toMatchObject({
      ok: false,
      message: expect.stringContaining("approved repository"),
    });
  });

  it("gives colliding names a numeric slug suffix, and refuses the same name twice", async () => {
    control.resolveControlledRepo.mockResolvedValue(
      proved(1, "approved", "personal"),
    );
    await createProject(await as(MEMBER), form("D3 Dup"));
    control.resolveControlledRepo.mockResolvedValue(
      proved(1, "approved", "personal"),
    );
    expect(
      await createProject(await as(OTHER), form("D3  dup ")),
    ).toMatchObject({
      ok: false,
      fieldErrors: { name: "A project with that name already exists." },
    });
    // "D3 Dup-" differs as a name but shares the slug base.
    control.resolveControlledRepo.mockResolvedValue(
      proved(1, "approved", "personal"),
    );
    expect(await createProject(await as(OTHER), form("D3 Dup!"))).toMatchObject(
      {
        ok: true,
        data: { slug: "d3-dup-2" },
      },
    );
  });

  it("lets exactly one of two simultaneous creates with one name win", async () => {
    control.resolveControlledRepo.mockResolvedValue(
      proved(1, "approved", "personal"),
    );
    const [a, b] = await Promise.all([
      createProject(await as(MEMBER), form("D3 Race")),
      createProject(await as(OTHER), form("D3 Race")),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(
      await rows(sql`select 1 from platform.projects where name = 'D3 Race'`),
    ).toHaveLength(1);
  });

  it("writes nothing when a repo's control cannot be proved", async () => {
    control.resolveControlledRepo.mockResolvedValue({
      ok: false,
      message: "Repository control could not be proved",
    });
    expect(
      await createProject(await as(MEMBER), form("D3 Nothing", "x/y")),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await rows(
        sql`select 1 from platform.projects where name = 'D3 Nothing'`,
      ),
    ).toHaveLength(0);
  });
});

// ── Editing, repos and owners ───────────────────────────────────────────────

describe("editing and owners", () => {
  it("lets an owner edit, and an officer only on a DevDogs-owned project", async () => {
    const mine = await project("D3 Edit");
    const values = { name: "D3 Edited", description: "new", tags: "x" };
    expect(await updateProject(await as(OTHER), mine, values)).toMatchObject({
      ok: false,
    });
    expect(await updateProject(await as(OFFICER), mine, values)).toMatchObject({
      ok: false,
    });
    expect(await updateProject(await as(MEMBER), mine, values)).toMatchObject({
      ok: true,
    });
    const owned = await project("D3 Owned", {
      owners: [],
      devdogsOwned: true,
      repos: [2],
    });
    expect(
      await updateProject(await as(OFFICER), owned, {
        ...values,
        name: "D3 Owned Two",
      }),
    ).toMatchObject({ ok: true });
    expect(await updateProject(await as(OTHER), owned, values)).toMatchObject({
      ok: false,
    });
  });

  it("refuses a name another project holds", async () => {
    await project("D3 Taken", { repos: [3], owners: [OTHER] });
    const mine = await project("D3 Mine");
    expect(
      await updateProject(await as(MEMBER), mine, {
        name: "d3 taken",
        description: "",
        tags: "",
      }),
    ).toMatchObject({
      ok: false,
      message: "A project with that name already exists.",
    });
  });

  it("adds a co-owner who has linked GitHub, refuses one who has not, and keeps the last owner", async () => {
    const mine = await project("D3 Owners");
    expect(await addOwner(await as(MEMBER), mine, UNLINKED)).toMatchObject({
      ok: false,
      message: expect.stringContaining("linked GitHub"),
    });
    expect(await addOwner(await as(MEMBER), mine, OTHER)).toMatchObject({
      ok: true,
    });
    expect(await addOwner(await as(MEMBER), mine, OTHER)).toMatchObject({
      ok: false,
    });
    expect(await removeOwner(await as(OTHER), mine, MEMBER)).toMatchObject({
      ok: true,
    });
    expect(await removeOwner(await as(OTHER), mine, OTHER)).toMatchObject({
      ok: false,
      message: expect.stringContaining("at least one owner"),
    });
  });

  it("lets an officer resolve an orphan by adding an owner", async () => {
    const orphan = await project("D3 Orphan", { owners: [] });
    expect(await addOwner(await as(OTHER), orphan, OTHER)).toMatchObject({
      ok: false,
    });
    expect(await addOwner(await as(OFFICER), orphan, OTHER)).toMatchObject({
      ok: true,
    });
  });

  it("links a repo under the ten-link limit and refuses the eleventh", async () => {
    const mine = await project("D3 Links", {
      repos: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    control.resolveControlledRepo.mockResolvedValue(
      proved(10, "approved", "personal"),
    );
    expect(await linkRepo(await as(MEMBER), mine, "d3owner10/repo-10")).toEqual(
      {
        ok: true,
        data: { approval: "approved" },
      },
    );
    control.resolveControlledRepo.mockResolvedValue(
      proved(11, "approved", "personal"),
    );
    expect(
      await linkRepo(await as(MEMBER), mine, "d3owner11/repo-11"),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("at most 10"),
    });
  });

  it("serializes two simultaneous links at the tenth", async () => {
    const mine = await project("D3 Links Race", {
      repos: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    control.resolveControlledRepo
      .mockResolvedValueOnce(proved(10, "approved", "personal"))
      .mockResolvedValueOnce(proved(11, "approved", "personal"));
    const results = await Promise.all([
      linkRepo(await as(MEMBER), mine, "d3owner10/repo-10"),
      linkRepo(await as(MEMBER), mine, "d3owner11/repo-11"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await rows(
        sql`select 1 from platform."projectRepos" where "projectId" = ${mine}::uuid`,
      ),
    ).toHaveLength(10);
  });

  it("keeps the last link, and a link a report cites", async () => {
    const mine = await project("D3 Unlink", { repos: [1, 2] });
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    const reportId = await filed(MEMBER, mine);
    expect(
      await unlinkRepo(await as(MEMBER), mine, String(REPO0 + 1)),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("cite"),
    });
    expect(
      await unlinkRepo(await as(MEMBER), mine, String(REPO0 + 2)),
    ).toMatchObject({ ok: true });
    expect(
      await unlinkRepo(await as(MEMBER), mine, String(REPO0 + 1)),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("at least one repository"),
    });
    expect(reportId).toBeTruthy();
  });

  it("has the database enforce the same two rules when the pre-check is bypassed", async () => {
    const mine = await project("D3 Guard", { repos: [1, 2] });
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    await filed(MEMBER, mine);
    await expect(
      db.execute(
        sql`delete from platform."projectRepos" where "projectId" = ${mine}::uuid and "githubRepoId" = ${REPO0 + 1}`,
      ),
    ).rejects.toThrow();
  });
});

// ── Lifecycle and officer-only actions ──────────────────────────────────────

describe("lifecycle", () => {
  it("archives (owner), un-archives (owner or officer) and audits each", async () => {
    const mine = await project("D3 Life");
    expect(await archiveProject(await as(OTHER), mine)).toMatchObject({
      ok: false,
    });
    expect(await archiveProject(await as(MEMBER), mine)).toMatchObject({
      ok: true,
    });
    expect(await archiveProject(await as(MEMBER), mine)).toMatchObject({
      ok: false,
    });
    expect(await unarchiveProject(await as(OTHER), mine)).toMatchObject({
      ok: false,
    });
    expect(await unarchiveProject(await as(OFFICER), mine)).toMatchObject({
      ok: true,
    });
    expect(await audits()).toEqual(["project.archived", "project.unarchived"]);
  });

  it("deletes only with no reports and no submissions", async () => {
    const clean = await project("D3 Clean");
    expect(await deleteProject(await as(MEMBER), clean)).toMatchObject({
      ok: true,
    });
    expect(
      await rows(
        sql`select 1 from platform.projects where id = ${clean}::uuid`,
      ),
    ).toHaveLength(0);

    const reported = await project("D3 Reported", { repos: [2] });
    await commit(MEMBER, 2, "2026-10-10T16:00:00Z", 2);
    await filed(MEMBER, reported, { shas: [sha(2)] });
    expect(await deleteProject(await as(MEMBER), reported)).toMatchObject({
      ok: false,
    });

    const [hackathon] = await rows<{ id: string }>(sql`
      insert into platform.hackathons (source, url, name, location, approval)
      values ('other', 'https://d3.example/hack', 'D3 Hack', 'Online', 'approved') returning id`);
    const submitted = await project("D3 Submitted", { repos: [3] });
    await db.execute(sql`
      insert into platform.submissions ("projectId", "hackathonId", url)
      values (${submitted}::uuid, ${hackathon!.id}::uuid, 'https://d3.example/sub')`);
    expect(await deleteProject(await as(MEMBER), submitted)).toMatchObject({
      ok: false,
    });
    await db.execute(
      sql`delete from platform.submissions where "projectId" = ${submitted}::uuid`,
    );
    await db.execute(
      sql`delete from platform.hackathons where id = ${hackathon!.id}::uuid`,
    );
  });

  it("never deletes a DevDogs-owned project, even past the pre-check", async () => {
    const owned = await project("D3 Platform Like", {
      owners: [],
      devdogsOwned: true,
    });
    expect(await deleteProject(await as(OFFICER), owned)).toMatchObject({
      ok: false,
    });
    await expect(
      db.execute(sql`delete from platform.projects where id = ${owned}::uuid`),
    ).rejects.toThrow();
  });

  it("makes a project DevDogs-owned once, irreversibly, without owner rows", async () => {
    const mine = await project("D3 Takeover");
    expect(await makeDevdogsOwned(await as(MEMBER), mine)).toMatchObject({
      ok: false,
    });
    expect(await makeDevdogsOwned(await as(OFFICER), mine)).toMatchObject({
      ok: true,
    });
    expect(await makeDevdogsOwned(await as(OFFICER), mine)).toMatchObject({
      ok: false,
    });
    expect(
      await rows(
        sql`select 1 from platform."projectOwners" where "projectId" = ${mine}::uuid and "userId" = ${OFFICER}::uuid`,
      ),
    ).toHaveLength(0);
    await expect(
      db.execute(
        sql`update platform.projects set "devdogsOwned" = false where id = ${mine}::uuid`,
      ),
    ).rejects.toThrow();
  });

  it("approves a pending link, then lets the owner reopen the project", async () => {
    const pending = await project("D3 Approval", {
      status: "archived",
      repos: [],
      pending: [4],
    });
    expect(
      await decideRepoLink(
        await as(MEMBER),
        pending,
        String(REPO0 + 4),
        "approve",
      ),
    ).toMatchObject({ ok: false });
    expect(
      await decideRepoLink(
        await as(OFFICER),
        pending,
        String(REPO0 + 4),
        "approve",
      ),
    ).toMatchObject({ ok: true });
    expect(
      await decideRepoLink(
        await as(OFFICER),
        pending,
        String(REPO0 + 4),
        "approve",
      ),
    ).toMatchObject({
      ok: false,
      message: "That link was already decided.",
    });
    const [link] = await rows<{ approval: string; approvedBy: string }>(
      sql`select approval, "approvedBy" from platform."projectRepos" where "projectId" = ${pending}::uuid`,
    );
    expect(link).toEqual({ approval: "approved", approvedBy: OFFICER });
    expect(await unarchiveProject(await as(MEMBER), pending)).toMatchObject({
      ok: true,
    });
  });

  it("sets and clears the advisor, officers only", async () => {
    const mine = await project("D3 Advisor");
    expect(await setAdvisor(await as(MEMBER), mine, ADVISOR)).toMatchObject({
      ok: false,
    });
    expect(await setAdvisor(await as(OFFICER), mine, ADVISOR)).toMatchObject({
      ok: true,
    });
    const [set] = await rows<{ advisorId: string | null }>(
      sql`select "advisorId" from platform.projects where id = ${mine}::uuid`,
    );
    expect(set!.advisorId).toBe(ADVISOR);
    expect(await setAdvisor(await as(OFFICER), mine, null)).toMatchObject({
      ok: true,
    });
  });
});

// ── Filing EL reports ───────────────────────────────────────────────────────

describe("filing a report (Q119 to Q121)", () => {
  it("cites the member's own stored commits in range, and audits it", async () => {
    const mine = await project("D3 File");
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    const reportId = await filed(MEMBER, mine);
    const cited = await rows<{ sha: string; githubRepoId: string }>(
      sql`select sha, "githubRepoId"::text from platform."projectReportCommits" where "reportId" = ${reportId}::uuid`,
    );
    expect(cited).toEqual([{ sha: sha(1), githubRepoId: String(REPO0 + 1) }]);
    expect(await audits()).toContain("projectReport.submitted");
  });

  it("needs a contributor, an active project and a non-officer", async () => {
    const mine = await project("D3 Who");
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    await commit(OFFICER, 1, "2026-10-10T16:00:00Z", 2);
    expect(await fileReport(await as(OTHER), input(mine), TODAY)).toMatchObject(
      {
        ok: false,
        message: expect.stringContaining("commits in this project"),
      },
    );
    expect(
      await fileReport(
        await as(OFFICER),
        input(mine, { shas: [sha(2)] }),
        TODAY,
      ),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("handled separately"),
    });
    await archiveProject(await as(MEMBER), mine);
    expect(
      await fileReport(await as(MEMBER), input(mine), TODAY),
    ).toMatchObject({
      ok: false,
      message: "Reports are taken only for active projects.",
    });
  });

  it("counts a commit toward a repo only through an approved link", async () => {
    const mine = await project("D3 Pending Repo", { repos: [], pending: [4] });
    await commit(MEMBER, 4, "2026-10-10T16:00:00Z", 4);
    expect(
      await fileReport(
        await as(MEMBER),
        input(mine, { shas: [sha(4)] }),
        TODAY,
      ),
    ).toMatchObject({ ok: false });
  });

  it("refuses a commit that is another member's, in another project's repo, or outside the range", async () => {
    const mine = await project("D3 Range", { repos: [1] });
    await commit(OTHER, 1, "2026-10-10T16:00:00Z", 1);
    await commit(MEMBER, 9, "2026-10-10T16:00:00Z", 2);
    await commit(MEMBER, 1, "2026-10-20T16:00:00Z", 3);
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 4);
    for (const bad of [1, 2, 3]) {
      expect(
        await fileReport(
          await as(MEMBER),
          input(mine, { shas: [sha(bad)] }),
          TODAY,
        ),
      ).toMatchObject({
        ok: false,
        fieldErrors: { shas: expect.stringContaining(sha(bad).slice(0, 7)) },
      });
    }
    expect(
      await fileReport(
        await as(MEMBER),
        input(mine, { shas: [sha(4)] }),
        TODAY,
      ),
    ).toMatchObject({ ok: true });
  });

  it("reads a commit's day in Eastern time", async () => {
    const mine = await project("D3 Eastern");
    // 03:59 UTC on Oct 15 is 23:59 Eastern on Oct 14: inside a range ending Oct 14.
    await commit(MEMBER, 1, "2026-10-15T03:59:59Z", 1);
    // 04:00 UTC on Oct 15 is 00:00 Eastern on Oct 15: outside it.
    await commit(MEMBER, 1, "2026-10-15T04:00:00Z", 2);
    expect(
      await fileReport(
        await as(MEMBER),
        input(mine, { shas: [sha(1)] }),
        TODAY,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await fileReport(
        await as(MEMBER),
        input(mine, { shas: [sha(2)] }),
        TODAY,
      ),
    ).toMatchObject({ ok: false });
  });

  it("takes 100 words, quarter hours and a sane range, in code and in the database", async () => {
    const mine = await project("D3 Shape");
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    for (const over of [
      { content: words(99) },
      { hours: 0.1 },
      { hours: 201 },
      { endDate: "2026-10-25" },
      { startDate: "2026-10-15" },
      { shas: [] },
    ]) {
      expect(
        await fileReport(await as(MEMBER), input(mine, over), TODAY),
      ).toMatchObject({ ok: false });
    }
    await expect(
      db.execute(sql`insert into platform."projectReports" ("projectId","userId","startDate","endDate",hours,content)
        values (${mine}::uuid, ${MEMBER}::uuid, '2026-10-01', '2026-10-02', 1, ${words(99)})`),
    ).rejects.toThrow();
  });

  it("counts words the way the app does, NBSP included", async () => {
    const mine = await project("D3 Nbsp");
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    const content = Array.from({ length: 100 }, () => "word").join("\u00a0");
    expect(
      await fileReport(await as(MEMBER), input(mine, { content }), TODAY),
    ).toMatchObject({ ok: true });
  });
});

describe("a commit backs one report", () => {
  it("names the commit when a second report reuses it, and frees it when the first goes", async () => {
    const mine = await project("D3 Reuse");
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1, "Add the feed\n\nBody");
    const first = await filed(MEMBER, mine);
    const second = await fileReport(await as(MEMBER), input(mine), TODAY);
    expect(second).toMatchObject({
      ok: false,
      message: expect.stringContaining(
        '"Add the feed" is already cited by another report',
      ),
    });
    expect(await deleteReport(await as(MEMBER), first)).toMatchObject({
      ok: true,
    });
    expect(
      await fileReport(await as(MEMBER), input(mine), TODAY),
    ).toMatchObject({ ok: true });
  });

  it("lets the table's UNIQUE decide two simultaneous reports on one commit", async () => {
    const mine = await project("D3 Concurrent");
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1, "Race the sha");
    const results = await Promise.all([
      fileReport(await as(MEMBER), input(mine), TODAY),
      fileReport(await as(MEMBER), input(mine), TODAY),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok);
    expect(loser).toMatchObject({
      ok: false,
      message: expect.stringContaining('"Race the sha" is already cited'),
    });
    expect(
      await rows(
        sql`select 1 from platform."projectReportCommits" where sha = ${sha(1)}`,
      ),
    ).toHaveLength(1);
  });

  it("keeps a failed resubmission atomic: the old citations survive", async () => {
    const mine = await project("D3 Atomic");
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    await commit(MEMBER, 1, "2026-10-11T16:00:00Z", 2);
    const other = await filed(MEMBER, mine, { shas: [sha(2)] });
    const first = await filed(MEMBER, mine, { shas: [sha(1)] });
    // Resubmitting the first to cite the second's commit fails; its own stays.
    expect(
      await fileReport(
        await as(MEMBER),
        input(mine, { reportId: first, shas: [sha(2)] }),
        TODAY,
      ),
    ).toMatchObject({ ok: false });
    const [kept] = await rows<{ sha: string }>(
      sql`select sha from platform."projectReportCommits" where "reportId" = ${first}::uuid`,
    );
    expect(kept!.sha).toBe(sha(1));
    expect(other).toBeTruthy();
  });
});

// ── Reviewing ───────────────────────────────────────────────────────────────

describe("reviewing a report (Q119, Q125)", () => {
  async function submitted() {
    const mine = await project("D3 Review", { advisor: ADVISOR });
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    return { mine, reportId: await filed(MEMBER, mine) };
  }

  it("lets the advisor and a holder of reviewProjectReports review, never an officer without either", async () => {
    const { reportId } = await submitted();
    expect(
      await reviewReport(await as(OFFICER), reportId, {
        action: "approve",
        hours: 5,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await reviewReport(await as(OTHER), reportId, {
        action: "approve",
        hours: 5,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await reviewReport(await as(REVIEWER), reportId, {
        action: "return",
        note: "Show more.",
      }),
    ).toMatchObject({ ok: true });
    await fileReport(
      await as(MEMBER),
      input(
        (
          await rows<{ id: string }>(
            sql`select "projectId" as id from platform."projectReports" where id = ${reportId}::uuid`,
          )
        )[0]!.id,
        { reportId },
      ),
      TODAY,
    );
    expect(
      await reviewReport(await as(ADVISOR), reportId, {
        action: "approve",
        hours: 5.25,
      }),
    ).toMatchObject({ ok: true });
  });

  it("approves with adjusted hours, which are what the evidence counts, and locks the report", async () => {
    const { mine, reportId } = await submitted();
    expect(
      await reviewReport(await as(ADVISOR), reportId, {
        action: "approve",
        hours: 5.25,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await reviewReport(await as(ADVISOR), reportId, {
        action: "approve",
        hours: 5,
      }),
    ).toMatchObject({
      ok: false,
      message: "That report was already reviewed.",
    });
    expect(
      await rows(
        sql`select "evidenceType", hours::text from platform."memberElEvidence" where "userId" = ${MEMBER}::uuid`,
      ),
    ).toEqual([{ evidenceType: "project_report", hours: "5.25" }]);
    expect(await getElSummary(MEMBER)).toMatchObject({
      projectHours: 5.25,
      totalHours: 5.25,
    });
    expect(
      await fileReport(await as(MEMBER), input(mine, { reportId }), TODAY),
    ).toMatchObject({
      ok: false,
      message: "An approved report cannot be changed.",
    });
    expect(await deleteReport(await as(MEMBER), reportId)).toMatchObject({
      ok: false,
    });
    expect(await audits()).toContain("projectReport.approved");
  });

  it("never lets a reviewer review their own report, advisor or holder alike", async () => {
    const mine = await project("D3 Own", {
      advisor: REVIEWER,
      owners: [REVIEWER],
    });
    await commit(REVIEWER, 1, "2026-10-10T16:00:00Z", 1);
    const reportId = await filed(REVIEWER, mine);
    expect(
      await reviewReport(await as(REVIEWER), reportId, {
        action: "approve",
        hours: 5,
      }),
    ).toMatchObject({
      ok: false,
      message: "You cannot review your own report.",
    });
  });

  it("returns with a note, counts for nothing, and takes a resubmission with the commits replaced", async () => {
    const { mine, reportId } = await submitted();
    await commit(MEMBER, 1, "2026-10-12T16:00:00Z", 2);
    expect(
      await reviewReport(await as(ADVISOR), reportId, {
        action: "return",
        note: " ",
      }),
    ).toMatchObject({ ok: false });
    expect(
      await reviewReport(await as(ADVISOR), reportId, {
        action: "return",
        note: "Say what you built.",
      }),
    ).toMatchObject({ ok: true });
    expect(await getElSummary(MEMBER)).toMatchObject({ totalHours: 0 });
    expect(
      await fileReport(
        await as(MEMBER),
        input(mine, { reportId, shas: [sha(2)] }),
        TODAY,
      ),
    ).toMatchObject({ ok: true });
    const [report] = await rows<{
      status: string;
      reviewedAt: Date | null;
      reviewNote: string | null;
    }>(
      sql`select status, "reviewedAt", "reviewNote" from platform."projectReports" where id = ${reportId}::uuid`,
    );
    expect(report).toEqual({
      status: "submitted",
      reviewedAt: null,
      reviewNote: null,
    });
    expect(
      (
        await rows<{ sha: string }>(
          sql`select sha from platform."projectReportCommits" where "reportId" = ${reportId}::uuid`,
        )
      ).map((r) => r.sha),
    ).toEqual([sha(2)]);
    expect(await audits()).toEqual(
      expect.arrayContaining([
        "projectReport.returned",
        "projectReport.submitted",
      ]),
    );
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
      values (${meetingId}::uuid, ${`d3-${meetingId.slice(-2)}`},
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
  it("deletes the member's reports, commits and ownership, frees nothing of anyone else's, and keeps the project", async () => {
    const mine = await project("D3 Delete", {
      owners: [MEMBER, OTHER],
      repos: [1],
      advisor: ADVISOR,
    });
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    await commit(OTHER, 1, "2026-10-10T16:00:00Z", 2);
    const sent = await filed(MEMBER, mine);
    const theirs = await filed(OTHER, mine, { shas: [sha(2)] });
    await deleteMembers([MEMBER]);

    const count = async (query: ReturnType<typeof sql>) =>
      (await db.execute(query)).length;
    expect(
      await count(
        sql`select 1 from platform."projectReports" where id = ${sent}::uuid`,
      ),
    ).toBe(0);
    expect(
      await count(
        sql`select 1 from platform."projectReportCommits" where "reportId" = ${sent}::uuid`,
      ),
    ).toBe(0);
    expect(
      await count(sql`select 1 from platform.commits where sha = ${sha(1)}`),
    ).toBe(0);
    expect(
      await count(
        sql`select 1 from platform."projectOwners" where "userId" = ${MEMBER}::uuid`,
      ),
    ).toBe(0);
    // Other members' work is untouched, and the project stays.
    expect(
      await count(
        sql`select 1 from platform."projectReports" where id = ${theirs}::uuid`,
      ),
    ).toBe(1);
    expect(
      await count(
        sql`select 1 from platform."projectReportCommits" where "reportId" = ${theirs}::uuid`,
      ),
    ).toBe(1);
    expect(
      await count(
        sql`select 1 from platform.projects where id = ${mine}::uuid`,
      ),
    ).toBe(1);
  });

  it("leaves a project without an owner or an advisor when they are deleted, not without a record", async () => {
    const mine = await project("D3 Orphaned", {
      owners: [OTHER],
      advisor: ADVISOR,
    });
    await deleteMembers([OTHER, ADVISOR]);
    const [row] = await rows<{ status: string; advisorId: string | null }>(
      sql`select status, "advisorId" from platform.projects where id = ${mine}::uuid`,
    );
    expect(row).toEqual({ status: "active", advisorId: null });
    expect(
      await rows(
        sql`select 1 from platform."projectOwners" where "projectId" = ${mine}::uuid`,
      ),
    ).toHaveLength(0);
    // An officer resolves the orphan.
    expect(await addOwner(await as(OFFICER), mine, MEMBER)).toMatchObject({
      ok: true,
    });
  });

  it("keeps an approved report's evidence empty for a deleted member", async () => {
    const mine = await project("D3 Evidence", { advisor: ADVISOR });
    await commit(MEMBER, 1, "2026-10-10T16:00:00Z", 1);
    const reportId = await filed(MEMBER, mine);
    await reviewReport(await as(ADVISOR), reportId, {
      action: "approve",
      hours: 6,
    });
    await deleteMembers([MEMBER]);
    expect(
      await rows(
        sql`select 1 from platform."memberElEvidence" where "userId" = ${MEMBER}::uuid`,
      ),
    ).toHaveLength(0);
  });
});
