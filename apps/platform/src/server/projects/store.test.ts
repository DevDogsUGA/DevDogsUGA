// @vitest-environment node
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- asymmetric matchers (expect.any, stringContaining) are typed any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "~/server/auth/access";
import { fakeDb, type Fixture, type Row } from "./fakeDb";

const mocks = vi.hoisted(() => ({
  db: {} as { transaction: unknown; execute: unknown },
  resolveControlledRepo: vi.fn(),
  saveRepo: vi.fn(),
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
vi.mock("~/server/github/control", () => ({
  resolveControlledRepo: mocks.resolveControlledRepo,
}));
vi.mock("~/server/github/store", () => ({ saveRepo: mocks.saveRepo }));

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

const PROJECT = "d3000000-0000-4000-a000-000000000001";
const OWNER = "d3000000-0000-4000-a000-0000000000a1";
const OTHER = "d3000000-0000-4000-a000-0000000000a2";
const OFFICER = "d3000000-0000-4000-a000-0000000000a3";
const caller = (userId: string, isLeader = false) =>
  ({
    userId,
    isLeader,
    minRank: Infinity,
    flags: { canReviewProjectReports: false },
  }) as unknown as Caller;

const row = (over: Record<string, unknown> = {}) => ({
  id: PROJECT,
  name: "Porchlight",
  slug: "porchlight",
  status: "active",
  devdogsOwned: false,
  advisorId: null,
  ...over,
});

let fake: ReturnType<typeof fakeDb>;
function use(fixture: Partial<Fixture> = {}) {
  fake = fakeDb({
    project: row(),
    owners: [OWNER],
    report: null,
    execute: [],
    ...fixture,
  });
  mocks.db.transaction = fake.db.transaction;
  mocks.db.execute = fake.db.execute;
}

const repo = (
  id: number,
  owner: { id: number; type: string },
  login = "me",
) => ({
  id,
  name: `repo-${id}`,
  private: false,
  owner: { ...owner, login },
  default_branch: "main",
});
const personal = (id = 1) => ({
  ok: true,
  data: {
    repo: repo(id, { id: 500, type: "User" }),
    approval: "approved",
    basis: "personal",
  },
});
const devdogsWrite = (id = 2) => ({
  ok: true,
  data: {
    repo: repo(id, { id: 168223232, type: "Organization" }, "DevDogsUGA"),
    approval: "approved",
    basis: "devdogs-write",
  },
});
const otherOrg = (id = 3) => ({
  ok: true,
  data: {
    repo: repo(id, { id: 900, type: "Organization" }, "acme"),
    approval: "pending",
    basis: "officer",
  },
});
const input = (repos: string) => ({
  name: "  Porch   Light ",
  description: "Lights",
  tags: "Web, web, Mobile",
  repos,
});

beforeEach(() => {
  vi.resetAllMocks();
  use();
});

describe("creating a project", () => {
  it("is active at once with a personal repo, and makes the creator its owner", async () => {
    use({ execute: [["select slug", []]] });
    mocks.resolveControlledRepo.mockResolvedValue(personal());
    const result = await createProject(caller(OWNER), input("me/repo-1"));
    expect(result).toEqual({
      ok: true,
      data: {
        projectId: "new-id",
        slug: "porch-light",
        status: "active",
        pending: 0,
      },
    });
    expect(fake.writes("insert", "projects")[0]!.values).toMatchObject({
      name: "Porch Light",
      status: "active",
      tags: ["web", "mobile"],
    });
    expect(fake.writes("insert", "projectOwners")[0]!.values).toMatchObject({
      userId: OWNER,
    });
    const link = fake.ran('insert into platform."projectRepos"')[0]!;
    expect(link.params).toEqual(
      expect.arrayContaining(["approved", "personal"]),
    );
    expect(fake.audits()).toEqual(["project.created"]);
  });

  it("is active at once with a DevDogsUGA repo the member can write to", async () => {
    use({ execute: [["select slug", []]] });
    mocks.resolveControlledRepo.mockResolvedValue(devdogsWrite());
    const result = await createProject(
      caller(OWNER),
      input("DevDogsUGA/repo-2"),
    );
    expect(result).toMatchObject({ ok: true, data: { status: "active" } });
    expect(fake.ran('insert into platform."projectRepos"')[0]!.params).toEqual(
      expect.arrayContaining(["approved", "devdogs-write"]),
    );
  });

  it("stays archived with a pending link when the only repo is in another org", async () => {
    use({ execute: [["select slug", []]] });
    mocks.resolveControlledRepo.mockResolvedValue(otherOrg());
    const result = await createProject(caller(OWNER), input("acme/repo-3"));
    expect(result).toMatchObject({
      ok: true,
      data: { status: "archived", pending: 1 },
    });
    expect(fake.writes("insert", "projects")[0]!.values).toMatchObject({
      status: "archived",
    });
    expect(fake.ran('insert into platform."projectRepos"')[0]!.params).toEqual(
      expect.arrayContaining(["pending", "officer"]),
    );
  });

  it("is active when any one of several repos is approved", async () => {
    use({ execute: [["select slug", []]] });
    mocks.resolveControlledRepo
      .mockResolvedValueOnce(otherOrg(3))
      .mockResolvedValueOnce(personal(1));
    const result = await createProject(
      caller(OWNER),
      input("acme/repo-3, me/repo-1"),
    );
    expect(result).toMatchObject({
      ok: true,
      data: { status: "active", pending: 1 },
    });
    expect(fake.ran('insert into platform."projectRepos"')).toHaveLength(2);
  });

  it("links one repo once when two names resolve to the same id", async () => {
    use({ execute: [["select slug", []]] });
    mocks.resolveControlledRepo.mockResolvedValue(personal(1));
    await createProject(caller(OWNER), input("me/repo-1, me/Repo-1-renamed"));
    expect(fake.ran('insert into platform."projectRepos"')).toHaveLength(1);
  });

  it("names the repo whose control could not be proved, and writes nothing", async () => {
    mocks.resolveControlledRepo.mockResolvedValue({
      ok: false,
      message: "Repository control could not be proved",
    });
    const result = await createProject(caller(OWNER), input("someone/else"));
    expect(result).toEqual({
      ok: false,
      message: "someone/else: Repository control could not be proved.",
      fieldErrors: {
        repos: "someone/else: Repository control could not be proved.",
      },
    });
    expect(fake.writes("insert", "projects")).toHaveLength(0);
    expect(mocks.saveRepo).not.toHaveBeenCalled();
  });

  it("wants a repo, a good name and good tags before any GitHub call", async () => {
    expect(await createProject(caller(OWNER), input(""))).toMatchObject({
      ok: false,
      fieldErrors: { repos: expect.any(String) },
    });
    expect(
      await createProject(caller(OWNER), { ...input("a/b"), name: "x" }),
    ).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
    expect(
      await createProject(caller(OWNER), {
        ...input("a/b"),
        tags: "x".repeat(41),
      }),
    ).toMatchObject({ ok: false, fieldErrors: { tags: expect.any(String) } });
    expect(mocks.resolveControlledRepo).not.toHaveBeenCalled();
  });

  it("suffixes the slug when the base is taken, and avoids reserved ones", async () => {
    use({ execute: [["select slug", [{ slug: "porch-light" }]]] });
    mocks.resolveControlledRepo.mockResolvedValue(personal());
    const result = await createProject(caller(OWNER), input("me/repo-1"));
    expect(result).toMatchObject({ ok: true, data: { slug: "porch-light-2" } });
    use({ execute: [["select slug", []]] });
    mocks.resolveControlledRepo.mockResolvedValue(personal());
    const platform = await createProject(caller(OWNER), {
      ...input("me/repo-1"),
      name: "Platform",
    });
    expect(platform).toMatchObject({ ok: true, data: { slug: "platform-2" } });
  });

  it("answers a taken name with a field error", async () => {
    use({
      execute: [["select slug", []]],
      failInsert: Object.assign(new Error("dup"), {
        code: "23505",
        constraint_name: "projects_name_key",
      }),
    });
    mocks.resolveControlledRepo.mockResolvedValue(personal());
    expect(await createProject(caller(OWNER), input("me/repo-1"))).toEqual({
      ok: false,
      message: "A project with that name already exists.",
      fieldErrors: { name: "A project with that name already exists." },
    });
  });

  it("retries once when another project took the slug first", async () => {
    use({
      execute: [["select slug", []]],
      failInsert: Object.assign(new Error("dup"), {
        code: "23505",
        constraint_name: "projects_slug_key",
      }),
    });
    mocks.resolveControlledRepo.mockResolvedValue(personal());
    expect(
      await createProject(caller(OWNER), input("me/repo-1")),
    ).toMatchObject({
      ok: true,
    });
  });
});

describe("editing a project", () => {
  const values = { name: "New Name", description: "d", tags: "a, b" };
  it("is the owner's", async () => {
    expect(await updateProject(caller(OWNER), PROJECT, values)).toMatchObject({
      ok: true,
    });
    expect(fake.writes("update", "projects")[0]!.values).toMatchObject({
      name: "New Name",
      tags: ["a", "b"],
    });
    expect(fake.audits()).toEqual(["project.updated"]);
  });
  it("is nobody else's, and an officer's only on a DevDogs-owned project", async () => {
    expect(await updateProject(caller(OTHER), PROJECT, values)).toMatchObject({
      ok: false,
    });
    expect(
      await updateProject(caller(OFFICER, true), PROJECT, values),
    ).toMatchObject({ ok: false });
    expect(fake.writes("update", "projects")).toHaveLength(0);
    use({ project: row({ devdogsOwned: true }), owners: [] });
    expect(
      await updateProject(caller(OFFICER, true), PROJECT, values),
    ).toMatchObject({ ok: true });
    use({ project: row({ devdogsOwned: true }), owners: [] });
    expect(await updateProject(caller(OTHER), PROJECT, values)).toMatchObject({
      ok: false,
    });
  });
  it("refuses a legacy row and a missing project", async () => {
    use({ project: row({ status: "proposed" }) });
    expect(await updateProject(caller(OWNER), PROJECT, values)).toMatchObject({
      ok: false,
      message: expect.stringContaining("predates"),
    });
    use({ project: null });
    expect(await updateProject(caller(OWNER), PROJECT, values)).toEqual({
      ok: false,
      message: "That project was not found.",
    });
  });
});

describe("repo links", () => {
  it("links a proved repo for an owner", async () => {
    use({ execute: [['select "githubRepoId"::text', []]] });
    mocks.resolveControlledRepo.mockResolvedValue(personal(7));
    const result = await linkRepo(caller(OWNER), PROJECT, "me/repo-7");
    expect(result).toEqual({ ok: true, data: { approval: "approved" } });
    expect(fake.audits()).toEqual(["project.repo_linked"]);
  });
  it("spends no GitHub request for someone who may not edit", async () => {
    const result = await linkRepo(caller(OTHER), PROJECT, "me/repo-7");
    expect(result.ok).toBe(false);
    expect(mocks.resolveControlledRepo).not.toHaveBeenCalled();
  });
  it("refuses a repo already linked and an eleventh link", async () => {
    use({
      execute: [
        [
          'select "githubRepoId"::text',
          [{ githubRepoId: "7", approval: "approved" }],
        ],
      ],
    });
    mocks.resolveControlledRepo.mockResolvedValue(personal(7));
    expect(await linkRepo(caller(OWNER), PROJECT, "me/repo-7")).toMatchObject({
      ok: false,
      message: "That repository is already linked.",
    });
    use({
      execute: [
        [
          'select "githubRepoId"::text',
          Array.from({ length: 10 }, (_, i) => ({
            githubRepoId: String(100 + i),
            approval: "approved",
          })),
        ],
      ],
    });
    mocks.resolveControlledRepo.mockResolvedValue(personal(7));
    expect(await linkRepo(caller(OWNER), PROJECT, "me/repo-7")).toMatchObject({
      ok: false,
      message: expect.stringContaining("at most 10"),
    });
  });
  it("puts the control check's refusal under the repo box", async () => {
    mocks.resolveControlledRepo.mockResolvedValue({
      ok: false,
      message: "Only public repositories count",
    });
    expect(await linkRepo(caller(OWNER), PROJECT, "me/secret")).toMatchObject({
      ok: false,
      fieldErrors: { repo: "me/secret: Only public repositories count." },
    });
  });
  it("unlinks a repo that is neither last, cited nor the last approved", async () => {
    const links = [
      { githubRepoId: "1", approval: "approved" },
      { githubRepoId: "2", approval: "approved" },
    ];
    use({
      execute: [
        ['select distinct pc."githubRepoId"', []],
        ['select "githubRepoId"::text', links],
      ],
    });
    expect(await unlinkRepo(caller(OWNER), PROJECT, "2")).toMatchObject({
      ok: true,
    });
    expect(fake.ran('delete from platform."projectRepos"')).toHaveLength(1);
  });
  it("keeps the last link and a link reports cite", async () => {
    use({
      execute: [
        ['select distinct pc."githubRepoId"', []],
        [
          'select "githubRepoId"::text',
          [{ githubRepoId: "1", approval: "approved" }],
        ],
      ],
    });
    expect(await unlinkRepo(caller(OWNER), PROJECT, "1")).toMatchObject({
      ok: false,
    });
    use({
      execute: [
        ['select distinct pc."githubRepoId"', [{ id: "1" }]],
        [
          'select "githubRepoId"::text',
          [
            { githubRepoId: "1", approval: "approved" },
            { githubRepoId: "2", approval: "approved" },
          ],
        ],
      ],
    });
    expect(await unlinkRepo(caller(OWNER), PROJECT, "1")).toMatchObject({
      ok: false,
      message: expect.stringContaining("cite"),
    });
    expect(fake.ran('delete from platform."projectRepos"')).toHaveLength(0);
  });
});

describe("owners", () => {
  const linked: [string, Row[]] = ["from auth.identities", [{ x: 1 }]];
  it("lets an owner or an officer add a co-owner who has linked GitHub", async () => {
    for (const actor of [caller(OWNER), caller(OFFICER, true)]) {
      use({
        execute: [["from auth.users", [{ x: 1 }]], linked],
      });
      expect(await addOwner(actor, PROJECT, OTHER)).toMatchObject({ ok: true });
      expect(fake.writes("insert", "projectOwners")[0]!.values).toMatchObject({
        userId: OTHER,
      });
    }
  });
  it("refuses a member without a linked GitHub account, a stranger and a repeat", async () => {
    use({ execute: [["from auth.users", [{ x: 1 }]]] });
    expect(await addOwner(caller(OWNER), PROJECT, OTHER)).toMatchObject({
      ok: false,
      message: expect.stringContaining("linked GitHub"),
    });
    use({ execute: [["from auth.users", [{ x: 1 }]], linked] });
    expect(await addOwner(caller(OTHER), PROJECT, OTHER)).toMatchObject({
      ok: false,
    });
    use({ execute: [["from auth.users", [{ x: 1 }]], linked] });
    expect(await addOwner(caller(OWNER), PROJECT, OWNER)).toMatchObject({
      ok: false,
      message: "That member is already an owner.",
    });
  });
  it("removes an owner when another remains", async () => {
    use({ owners: [OWNER, OTHER] });
    expect(await removeOwner(caller(OWNER), PROJECT, OTHER)).toMatchObject({
      ok: true,
    });
    expect(fake.writes("delete", "projectOwners")).toHaveLength(1);
    expect(fake.audits()).toEqual(["project.owner_removed"]);
  });
  it("keeps the last owner of an ordinary project, but not of a DevDogs-owned one", async () => {
    expect(await removeOwner(caller(OWNER), PROJECT, OWNER)).toMatchObject({
      ok: false,
      message: expect.stringContaining("at least one owner"),
    });
    use({ project: row({ devdogsOwned: true }), owners: [OWNER] });
    expect(
      await removeOwner(caller(OFFICER, true), PROJECT, OWNER),
    ).toMatchObject({ ok: true });
  });
  it("lets an officer resolve an orphan by adding an owner", async () => {
    use({
      owners: [],
      execute: [["from auth.users", [{ x: 1 }]], linked],
    });
    expect(await addOwner(caller(OFFICER, true), PROJECT, OTHER)).toMatchObject(
      {
        ok: true,
      },
    );
  });
});

describe("archive, un-archive and delete", () => {
  it("lets an owner archive an active project, and nobody else", async () => {
    expect(await archiveProject(caller(OWNER), PROJECT)).toMatchObject({
      ok: true,
    });
    expect(fake.writes("update", "projects")[0]!.values).toMatchObject({
      status: "archived",
    });
    expect(await archiveProject(caller(OTHER), PROJECT)).toMatchObject({
      ok: false,
    });
    expect(await archiveProject(caller(OFFICER, true), PROJECT)).toMatchObject({
      ok: false,
    });
  });
  it("lets an owner or an officer un-archive once a repo is approved", async () => {
    const approved: [string, Row[]][] = [
      [
        'select "githubRepoId"::text',
        [{ githubRepoId: "1", approval: "approved" }],
      ],
    ];
    for (const actor of [caller(OWNER), caller(OFFICER, true)]) {
      use({ project: row({ status: "archived" }), execute: approved });
      expect(await unarchiveProject(actor, PROJECT)).toMatchObject({
        ok: true,
      });
      expect(fake.writes("update", "projects")[0]!.values).toMatchObject({
        status: "active",
      });
    }
  });
  it("will not un-archive a project with no approved repo", async () => {
    use({
      project: row({ status: "archived" }),
      execute: [
        [
          'select "githubRepoId"::text',
          [{ githubRepoId: "1", approval: "pending" }],
        ],
      ],
    });
    expect(await unarchiveProject(caller(OWNER), PROJECT)).toMatchObject({
      ok: false,
      message: expect.stringContaining("approved repository"),
    });
  });
  const counts = (reports: string, submissions: string): [string, Row[]][] => [
    ["as reports", [{ reports, submissions }]],
  ];
  it("deletes only with no reports and no submissions", async () => {
    use({ execute: counts("0", "0") });
    expect(await deleteProject(caller(OWNER), PROJECT)).toMatchObject({
      ok: true,
    });
    expect(fake.writes("delete", "projects")).toHaveLength(1);
    use({ execute: counts("2", "0") });
    expect(await deleteProject(caller(OWNER), PROJECT)).toMatchObject({
      ok: false,
    });
    use({ execute: counts("0", "1") });
    expect(await deleteProject(caller(OWNER), PROJECT)).toMatchObject({
      ok: false,
    });
    expect(fake.writes("delete", "projects")).toHaveLength(0);
  });
  it("never deletes a DevDogs-owned project", async () => {
    use({
      project: row({ devdogsOwned: true }),
      owners: [],
      execute: counts("0", "0"),
    });
    expect(await deleteProject(caller(OFFICER, true), PROJECT)).toMatchObject({
      ok: false,
      message: expect.stringContaining("DevDogs-owned"),
    });
  });
  it("turns the database guard's refusal into a sentence", async () => {
    // A guard raising inside the transaction after the pre-check passed.
    mocks.db.transaction = async () => {
      throw Object.assign(new Error("Project cannot be deleted"), {
        code: "P0001",
      });
    };
    expect(await deleteProject(caller(OWNER), PROJECT)).toMatchObject({
      ok: false,
      message: expect.stringContaining("cannot be deleted"),
    });
  });
});

describe("officer-only actions", () => {
  it("approves or declines a pending link, once", async () => {
    use({ execute: [["for update", [{ approval: "pending" }]]] });
    expect(
      await decideRepoLink(caller(OFFICER, true), PROJECT, "3", "approve"),
    ).toMatchObject({ ok: true, message: "Repository approved." });
    expect(fake.audits()).toEqual(["project.repo_approved"]);
    use({ execute: [["for update", [{ approval: "pending" }]]] });
    expect(
      await decideRepoLink(caller(OFFICER, true), PROJECT, "3", "decline"),
    ).toMatchObject({ ok: true, message: "Repository declined." });
    expect(fake.audits()).toEqual(["project.repo_declined"]);
    use({ execute: [["for update", [{ approval: "approved" }]]] });
    expect(
      await decideRepoLink(caller(OFFICER, true), PROJECT, "3", "approve"),
    ).toMatchObject({ ok: false, message: "That link was already decided." });
  });
  it("turns every officer-only action away from an owner", async () => {
    use({ execute: [["for update", [{ approval: "pending" }]]] });
    expect(
      await decideRepoLink(caller(OWNER), PROJECT, "3", "approve"),
    ).toMatchObject({ ok: false });
    expect(await setAdvisor(caller(OWNER), PROJECT, OTHER)).toMatchObject({
      ok: false,
    });
    expect(await makeDevdogsOwned(caller(OWNER), PROJECT)).toMatchObject({
      ok: false,
    });
    expect(fake.calls).not.toContainEqual(
      expect.objectContaining({ kind: "update" }),
    );
  });
  it("sets and clears the advisor", async () => {
    use({ execute: [["from auth.users", [{ x: 1 }]]] });
    expect(
      await setAdvisor(caller(OFFICER, true), PROJECT, OTHER),
    ).toMatchObject({
      ok: true,
    });
    expect(fake.writes("update", "projects")[0]!.values).toMatchObject({
      advisorId: OTHER,
    });
    use();
    expect(
      await setAdvisor(caller(OFFICER, true), PROJECT, null),
    ).toMatchObject({
      ok: true,
    });
    expect(fake.writes("update", "projects")[0]!.values).toMatchObject({
      advisorId: null,
    });
  });
  it("will not name an advisor who is not a member", async () => {
    expect(
      await setAdvisor(caller(OFFICER, true), PROJECT, OTHER),
    ).toMatchObject({
      ok: false,
      message: "Choose a member as the advisor.",
    });
  });
  it("makes a project DevDogs-owned, once, without touching owner rows", async () => {
    expect(
      await makeDevdogsOwned(caller(OFFICER, true), PROJECT),
    ).toMatchObject({
      ok: true,
    });
    expect(fake.writes("update", "projects")[0]!.values).toMatchObject({
      devdogsOwned: true,
    });
    expect(fake.writes("insert", "projectOwners")).toHaveLength(0);
    expect(fake.writes("delete", "projectOwners")).toHaveLength(0);
    use({ project: row({ devdogsOwned: true }) });
    expect(
      await makeDevdogsOwned(caller(OFFICER, true), PROJECT),
    ).toMatchObject({
      ok: false,
      message: "That project is already DevDogs-owned.",
    });
  });
});
