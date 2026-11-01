// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
  update: vi.fn(),
  insert: vi.fn(),
  set: vi.fn(),
  values: vi.fn(),
}));

vi.mock("~/server/db", () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Promise.resolve([mocks.current].filter(Boolean)),
        }),
      }),
    }),
    update: (table: unknown) => {
      mocks.update(table);
      return {
        set: (value: unknown) => {
          mocks.set(value);
          return { where: () => Promise.resolve() };
        },
      };
    },
    insert: (table: unknown) => {
      mocks.insert(table);
      return {
        values: (value: unknown) => {
          mocks.values(value);
          return Promise.resolve();
        },
      };
    },
  };
  return {
    db: { transaction: (work: (t: typeof tx) => unknown) => work(tx) },
  };
});

vi.mock("~/server/auth/access", () => ({
  rules: { officer: (caller: { isLeader: boolean }) => caller.isLeader },
}));

const { updateProjectShowcase } = await import("./showcaseWrite");

const officer = {
  userId: "officer-1",
  isLeader: true,
  flags: {},
  minRank: 1,
} as never;
const member = {
  userId: "member-1",
  isLeader: false,
  flags: {},
  minRank: 99,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.current = {
    id: "p1",
    name: "DogDays",
    featured: false,
    inSwitcher: false,
    displayOrder: 0,
    tagline: "Schedule Builder",
    liveUrl: null,
  };
});

describe("updateProjectShowcase", () => {
  it("refuses a Caller who is not an officer, before reading or writing", async () => {
    await expect(
      updateProjectShowcase(member, "p1", { featured: true }),
    ).rejects.toThrow(ExpectedFailure);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("refuses an invalid input with a message per field, and writes nothing", async () => {
    const failure = await updateProjectShowcase(officer, "p1", {
      liveUrl: "javascript:alert(1)",
      iconKey: "<svg>",
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ExpectedFailure);
    expect(
      Object.keys((failure as ExpectedFailure).fieldErrors!).sort(),
    ).toEqual(["iconKey", "liveUrl"]);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("refuses a project that does not exist", async () => {
    mocks.current = undefined;
    await expect(
      updateProjectShowcase(officer, "missing", { featured: true }),
    ).rejects.toThrow("That project was not found.");
  });

  it("writes only the fields that differ, and audits them with old and new values", async () => {
    const result = await updateProjectShowcase(officer, "p1", {
      featured: true,
      inSwitcher: false,
      tagline: "Schedule Builder",
      liveUrl: "https://dogdays.dev",
    });
    expect(result.changes).toEqual({
      featured: { from: false, to: true },
      liveUrl: { from: null, to: "https://dogdays.dev" },
    });
    expect(mocks.set).toHaveBeenCalledWith({
      featured: true,
      liveUrl: "https://dogdays.dev",
      updatedAt: expect.any(Date) as Date,
    });
    expect(mocks.values).toHaveBeenCalledWith({
      actorType: "user",
      actorUserId: "officer-1",
      source: "platform",
      action: "project.showcase_changed",
      targetType: "project",
      targetId: "p1",
      metadata: { name: "DogDays", changes: result.changes },
    });
  });

  it("clears a field given as a blank", async () => {
    const result = await updateProjectShowcase(officer, "p1", { tagline: " " });
    expect(result.changes).toEqual({
      tagline: { from: "Schedule Builder", to: null },
    });
  });

  it("writes and audits nothing when every field already has that value", async () => {
    const result = await updateProjectShowcase(officer, "p1", {
      featured: false,
      displayOrder: 0,
    });
    expect(result.changes).toEqual({});
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
