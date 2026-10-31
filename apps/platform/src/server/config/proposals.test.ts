import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeGithub, TEST_PRIVATE_KEY_PKCS1 } from "./githubFake";
import type { SavedEdit } from "./edits";

interface TestEnv {
  GH_CONFIG_APP_ID: string | undefined;
  GH_CONFIG_APP_PRIVATE_KEY: string | undefined;
  GITHUB_ORG: string;
}

const mocks = vi.hoisted(() => ({
  env: ((): TestEnv => ({
    GH_CONFIG_APP_ID: undefined,
    GH_CONFIG_APP_PRIVATE_KEY: undefined,
    GITHUB_ORG: "DevDogsUGA",
  }))(),
  isOfficer: vi.fn(),
  listEdits: vi.fn(),
  consume: vi.fn(),
  insertValues: vi.fn(),
  profileName: null as string | null,
  github: [] as { id: string; login: string | null }[],
}));

vi.mock("~/env", () => ({ env: mocks.env }));
vi.mock("~/server/auth/permissions", () => ({
  getCallerContext: async () => ({
    resolvedPermissions: {},
    isLeader: Boolean(await mocks.isOfficer()),
    minRank: 100,
  }),
}));
vi.mock("./editsStore", () => ({ listEdits: mocks.listEdits }));
vi.mock("~/server/rateLimit", () => ({ consumeRateLimit: mocks.consume }));
vi.mock("~/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: async () => [{ name: mocks.profileName }] }),
    }),
    execute: async () => mocks.github,
    insert: () => ({ values: mocks.insertValues }),
  },
}));

const { buildPreview, openConfigPr, officerIdentity } =
  await import("./proposals");
const { getAuthoredFiles } = await import("@devdogsuga/events");

const USER = "11111111-1111-4111-8111-111111111111";
const roomEdit: SavedEdit = {
  collection: "meeting",
  key: "2026-09-14",
  isNew: false,
  fields: { room: "200" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.GH_CONFIG_APP_ID = "9";
  mocks.env.GH_CONFIG_APP_PRIVATE_KEY = TEST_PRIVATE_KEY_PKCS1;
  mocks.isOfficer.mockResolvedValue(true);
  mocks.listEdits.mockResolvedValue([roomEdit]);
  mocks.consume.mockResolvedValue(true);
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.profileName = "Test Officer";
  mocks.github = [];
  delete process.env.DEPLOY_ENV;
});

describe("openConfigPr permissions and gates", () => {
  it("refuses anyone who is not an officer, before reading or calling anything", async () => {
    mocks.isOfficer.mockResolvedValue(false);
    const github = fakeGithub();
    expect(await openConfigPr(USER, { fetch: github.fetch })).toEqual({
      status: "forbidden",
    });
    expect(mocks.listEdits).not.toHaveBeenCalled();
    expect(github.calls).toEqual([]);
  });

  it("reports itself unavailable without the app's credentials", async () => {
    mocks.env.GH_CONFIG_APP_PRIVATE_KEY = undefined;
    const github = fakeGithub();
    expect(await openConfigPr(USER, { fetch: github.fetch })).toEqual({
      status: "unavailable",
    });
    expect(github.calls).toEqual([]);
  });

  it("refuses an invalid proposal without touching GitHub or spending the rate limit", async () => {
    mocks.listEdits.mockResolvedValue([
      { ...roomEdit, fields: { venue: "nowhere" } },
    ]);
    const github = fakeGithub();
    const result = await openConfigPr(USER, { fetch: github.fetch });
    expect(result.status).toBe("invalid");
    expect(github.calls).toEqual([]);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("says there is nothing to propose when the edits equal the official config", async () => {
    mocks.listEdits.mockResolvedValue([
      { ...roomEdit, fields: { room: "124" } },
    ]);
    const github = fakeGithub();
    expect(await openConfigPr(USER, { fetch: github.fetch })).toEqual({
      status: "nothing_to_propose",
    });
    expect(github.calls).toEqual([]);
  });

  it("stops at the hourly limit before calling GitHub", async () => {
    mocks.consume.mockResolvedValue(false);
    const github = fakeGithub();
    expect(await openConfigPr(USER, { fetch: github.fetch })).toEqual({
      status: "rate_limited",
    });
    expect(github.calls).toEqual([]);
    expect(mocks.consume).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "config:pr",
        subjectId: USER,
        limit: 3,
      }),
    );
  });
});

describe("openConfigPr audit", () => {
  it("writes one audit row for every pull request it opens", async () => {
    const github = fakeGithub();
    const result = await openConfigPr(USER, { fetch: github.fetch });
    expect(result).toMatchObject({ status: "opened", number: 42, draft: true });
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    expect(mocks.insertValues.mock.calls[0]?.[0]).toMatchObject({
      actorType: "user",
      actorUserId: USER,
      source: "platform",
      action: "config.pr_opened",
      targetType: "configProposal",
      targetId: "DevDogsUGA/DevDogsUGA#42",
      metadata: {
        url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/42",
        items: ["meeting:2026-09-14"],
        staging: true,
      },
    });
  });

  it("opens a real, non-draft pull request only in production", async () => {
    process.env.DEPLOY_ENV = "production";
    const github = fakeGithub();
    const result = await openConfigPr(USER, { fetch: github.fetch });
    expect(result).toMatchObject({ status: "opened", draft: false });
    expect(github.calls.some((c) => c.path.endsWith("/labels"))).toBe(false);
  });

  it("writes no audit row when GitHub refuses", async () => {
    const github = fakeGithub({
      failOn: "POST /repos/DevDogsUGA/DevDogsUGA/pulls",
    });
    expect((await openConfigPr(USER, { fetch: github.fetch })).status).toBe(
      "github_error",
    );
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("still reports the pull request when the audit write fails", async () => {
    mocks.insertValues.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const github = fakeGithub();
    expect((await openConfigPr(USER, { fetch: github.fetch })).status).toBe(
      "opened",
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("officerIdentity", () => {
  it("credits a linked GitHub account by its noreply address", async () => {
    mocks.github = [{ id: "4242", login: "tester" }];
    expect(await officerIdentity(USER)).toEqual({
      name: "Test Officer",
      email: "4242+tester@users.noreply.github.com",
    });
  });

  it("never uses a school address when GitHub is not linked", async () => {
    expect((await officerIdentity(USER)).email).toBe("noreply@devdogsuga.org");
  });
});

describe("buildPreview", () => {
  it("reports validation errors and the diff together", () => {
    const official = getAuthoredFiles() as never;
    const preview = buildPreview(official, [
      { ...roomEdit, fields: { room: "200", venue: "nowhere" } },
    ]);
    expect(preview.changes).toHaveLength(1);
    expect(preview.validation.ok).toBe(false);
  });
});

vi.mock("~/server/auth", () => ({
  expectSession: async () => "11111111-1111-4111-8111-111111111111",
}));
