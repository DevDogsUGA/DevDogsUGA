// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "~/server/auth/access";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  loadProject: vi.fn(),
  getRelation: vi.fn(),
  docsProjects: [{ slug: "workshops" }, { slug: "operations" }],
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(mocks.rows) }),
    }),
    execute: () => Promise.resolve(mocks.rows),
  },
}));
vi.mock("~/server/db/schema", () => ({
  projects: {
    id: "id",
    name: "name",
    devdogsOwned: "devdogsOwned",
    slug: "slug",
  },
}));
vi.mock("drizzle-orm", () => ({ eq: () => null, sql: () => null }));
vi.mock("./docsStore", () => ({
  createDocsStore: () => ({ loadProject: mocks.loadProject }),
}));
vi.mock("~/server/projects/load", () => ({ getRelation: mocks.getRelation }));
vi.mock("./queries", () => ({ getDocsProjects: () => mocks.docsProjects }));
vi.mock("~/server/auth/access", () => ({
  rules: {
    officer: (caller: Caller) => caller.isLeader,
    previewDocs: (caller: Caller) => caller.flags.canPreviewDocs,
  },
}));

const { isBundledSlug, listPreviewableProjects, resolvePreviewTarget } =
  await import("./previewTarget");

const caller = (over: Partial<Caller> = {}, canPreviewDocs = false): Caller =>
  ({
    userId: "u-1",
    flags: { canPreviewDocs },
    isLeader: false,
    minRank: 99,
    ...over,
  }) as unknown as Caller;

const repo = (over = {}) => ({
  githubRepoId: "1234",
  ownerId: "9",
  owner: "DevDogsUGA",
  name: "demo",
  approved: true,
  available: true,
  ...over,
});

const loaded = (over: { project?: object; repos?: object[] } = {}) => ({
  project: {
    id: "p-1",
    name: "Demo",
    slug: "demo",
    docsRepoId: null,
    docsRequested: false,
    docsPausedAt: null,
    docsFirstPublishedAt: null,
    ...over.project,
  },
  repos: over.repos ?? [repo()],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rows = [{ id: "p-1", name: "Demo", devdogsOwned: false }];
  mocks.loadProject.mockResolvedValue(loaded());
  mocks.getRelation.mockResolvedValue({
    isOwner: false,
    isContributor: false,
    isAdvisor: false,
  });
});

describe("which slugs have no repository to read", () => {
  it("the site's own bundled docs, and the reserved names", () => {
    for (const slug of ["platform", "toolkit", "workshops", "operations"])
      expect(isBundledSlug(slug)).toBe(true);
    expect(isBundledSlug("dogdays")).toBe(false);
  });

  it("are never a target, however the caller relates to them", async () => {
    mocks.getRelation.mockResolvedValue({
      isOwner: true,
      isContributor: true,
      isAdvisor: false,
    });
    expect(await resolvePreviewTarget(caller(), "platform")).toBeNull();
    expect(mocks.loadProject).not.toHaveBeenCalled();
  });
});

describe("resolving a project's preview", () => {
  it("names the repository the docs come from and the caller's relation to it", async () => {
    mocks.getRelation.mockResolvedValue({
      isOwner: false,
      isContributor: true,
      isAdvisor: true,
    });
    expect(await resolvePreviewTarget(caller({}, true), "demo")).toEqual({
      id: "p-1",
      slug: "demo",
      name: "Demo",
      repoId: "1234",
      facts: { isOwner: false, isContributor: true, isReviewer: true },
    });
  });

  it("counts an officer as an owner of a DevDogs-owned project, and of no other", async () => {
    mocks.rows = [{ id: "p-1", name: "Demo", devdogsOwned: true }];
    expect(
      (await resolvePreviewTarget(caller({ isLeader: true }), "demo"))?.facts
        .isOwner,
    ).toBe(true);
    mocks.rows = [{ id: "p-1", name: "Demo", devdogsOwned: false }];
    expect(
      (await resolvePreviewTarget(caller({ isLeader: true }), "demo"))?.facts
        .isOwner,
    ).toBe(false);
  });

  it("reads the repository the project chose for its docs, when it has several", async () => {
    mocks.loadProject.mockResolvedValue(
      loaded({
        project: { docsRepoId: "77" },
        repos: [repo(), repo({ githubRepoId: "77", name: "docs-repo" })],
      }),
    );
    expect((await resolvePreviewTarget(caller(), "demo"))?.repoId).toBe("77");
  });

  it("is null for a project with several repositories and no choice", async () => {
    mocks.loadProject.mockResolvedValue(
      loaded({ repos: [repo(), repo({ githubRepoId: "77" })] }),
    );
    expect(await resolvePreviewTarget(caller(), "demo")).toBeNull();
  });

  it("is null for no project, no repository, one that is not approved, or one that is unavailable", async () => {
    mocks.rows = [];
    expect(await resolvePreviewTarget(caller(), "nope")).toBeNull();
    mocks.rows = [{ id: "p-1", name: "Demo", devdogsOwned: false }];
    mocks.loadProject.mockResolvedValue(loaded({ repos: [] }));
    expect(await resolvePreviewTarget(caller(), "demo")).toBeNull();
    mocks.loadProject.mockResolvedValue(
      loaded({ repos: [repo({ approved: false })] }),
    );
    expect(await resolvePreviewTarget(caller(), "demo")).toBeNull();
    mocks.loadProject.mockResolvedValue(
      loaded({ repos: [repo({ available: false })] }),
    );
    expect(await resolvePreviewTarget(caller(), "demo")).toBeNull();
  });
});

describe("the landing page's list", () => {
  it("leaves out the bundled docs", async () => {
    mocks.rows = [
      { slug: "dogdays", name: "DogDays" },
      { slug: "platform", name: "DevDogs Platform" },
    ];
    expect(await listPreviewableProjects()).toEqual([
      { slug: "dogdays", name: "DogDays" },
    ]);
  });
});
