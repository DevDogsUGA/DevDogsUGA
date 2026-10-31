// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("~/server/auth/access", () => ({
  authorizeSession: () =>
    Promise.resolve(
      state.userId
        ? { ok: true, caller: { userId: state.userId } }
        : { ok: false, message: "Session expected but not found." },
    ),
}));

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  returning: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("~/server/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        mocks.set(values);
        return {
          where: (clause: unknown) => {
            mocks.where(clause);
            return { returning: mocks.returning };
          },
        };
      },
    }),
  },
}));
vi.mock("~/server/db/schema", () => ({
  profiles: {
    userId: "profiles.userId",
    quarantinedBy: "profiles.q",
    handle: "profiles.handle",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ and: parts }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  isNull: (column: unknown) => ({ isNull: column }),
  sql: (strings: TemplateStringsArray) => ({ sql: strings.join("?") }),
}));
vi.mock("~/server/auth", () => ({
  authenticate: vi.fn(),
  expectSession: vi.fn(),
}));
vi.mock("~/server/features", () => ({ publicProfilesEnabled: () => true }));
vi.mock("~/server/loaders/verification", () => ({
  getVerificationStatus: vi.fn(),
}));
vi.mock("~/server/loaders/publicProfiles", () => ({
  getHandleOptions: vi.fn(),
}));
vi.mock("~/server/rateLimit", () => ({ consumeRateLimit: vi.fn() }));

const { updateAccountVisibility } = await import("./publicProfile");

const USER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  state.userId = USER;
  mocks.returning.mockResolvedValue([{ handle: "ada" }]);
});

describe("updateAccountVisibility", () => {
  it("refuses a signed-out caller before writing", async () => {
    state.userId = null;
    expect(await updateAccountVisibility({ showGithub: true })).toEqual({
      ok: false,
      message: "Session expected but not found.",
    });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("refuses a switch that is not a connected account", async () => {
    expect(
      await updateAccountVisibility({ showEmail: true } as never),
    ).toMatchObject({ ok: false });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("writes every switch sent to the caller's own row and revalidates their pages", async () => {
    expect(
      await updateAccountVisibility({ showGithub: true, showLinkedin: false }),
    ).toEqual({ ok: true });
    expect(mocks.set).toHaveBeenCalledWith({
      showGithub: true,
      showLinkedin: false,
    });
    const where = JSON.stringify(mocks.where.mock.calls[0]);
    expect(where).toContain(`"eq":["profiles.userId","${USER}"]`);
    expect(where).toContain("profiles.q");
    expect(where).toContain("is_suspended");
    expect(
      mocks.revalidatePath.mock.calls.map(([path]) => path as string),
    ).toEqual(expect.arrayContaining(["/community", "/community/@ada"]));
  });

  it("writes nothing when nothing is sent", async () => {
    expect(await updateAccountVisibility({})).toEqual({ ok: true });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("refuses a locked profile without revalidating", async () => {
    mocks.returning.mockResolvedValue([]);
    expect(await updateAccountVisibility({ showDiscord: true })).toEqual({
      ok: false,
      message: "Your profile is locked, so it cannot be changed.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
