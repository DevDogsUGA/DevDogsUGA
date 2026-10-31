import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Assigning a role to a member and taking it away. Both return an
 * ActionResult: the rank guard, a role Discord will not let the caller manage
 * and a Discord removal that failed after the database write are failures, not
 * thrown errors. The real guards run; the database and Discord are replaced.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const ROLE = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  access: null as { ok: boolean; message?: string; caller?: unknown } | null,
  target: null as null | Record<string, unknown>,
  inserted: [] as unknown[],
  deleted: 0,
  guildRoles: [] as { id: string; position: number }[],
  canManage: true,
  discordUserId: null as string | null,
  push: vi.fn(),
  revalidate: vi.fn(),
}));

const CALLER = {
  ok: true,
  caller: {
    userId: USER,
    minRank: 3,
    flags: { canManageRoles: true },
  },
};

vi.mock("~/server/auth", () => ({ expectSession: vi.fn() }));
vi.mock("~/server/auth/access", () => ({
  authorize: () => Promise.resolve(mocks.access),
  rules: { manageRoles: () => true },
}));
vi.mock("~/server/db", () => {
  const select = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "where", "innerJoin", "orderBy", "limit"]) {
      builder[method] = () => builder;
    }
    builder.then = (resolve: (rows: unknown[]) => unknown) =>
      resolve(mocks.target ? [mocks.target] : []);
    return builder;
  };
  return {
    db: {
      select,
      insert: () => ({
        values: (value: unknown) => {
          mocks.inserted.push(value);
          return { onConflictDoNothing: async () => undefined };
        },
      }),
      delete: () => ({
        where: async () => {
          mocks.deleted += 1;
        },
      }),
    },
  };
});
vi.mock("~/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("~/supabase/drizzle/schema", () => ({ identitiesInAuth: {} }));
vi.mock("~/server/discord/adminCapability", () => ({
  getDiscordSyncCapability: async () => ({}),
  canManageDiscordRolePosition: () => mocks.canManage,
}));
vi.mock("~/server/discord/memberSync", () => ({
  getDiscordUserId: async () => mocks.discordUserId,
  pushMemberRoleChange: mocks.push,
}));
vi.mock("~/server/discord/roleSync", () => ({
  fetchGuildRoles: async () => mocks.guildRoles,
  pushRoleToDiscord: vi.fn(),
}));
vi.mock("~/server/loaders/officers", () => ({
  revalidateOfficers: mocks.revalidate,
}));

const { assignRoleToUser, removeRoleFromUser } = await import("./permissions");

const customRole = (over: Record<string, unknown> = {}) => ({
  rank: 10,
  roleType: "custom",
  discordRoleId: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = CALLER;
  mocks.target = customRole();
  mocks.inserted = [];
  mocks.deleted = 0;
  mocks.guildRoles = [{ id: "d-role", position: 4 }];
  mocks.canManage = true;
  mocks.discordUserId = null;
  mocks.push.mockResolvedValue(undefined);
});

describe("assignRoleToUser", () => {
  it("grants a plain role and says so", async () => {
    expect(await assignRoleToUser(MEMBER, ROLE)).toEqual({
      ok: true,
      message: "Role added.",
    });
    expect(mocks.inserted).toEqual([{ userId: MEMBER, roleId: ROLE }]);
    expect(mocks.revalidate).toHaveBeenCalled();
  });

  it("refuses a caller without canManageRoles, and writes nothing", async () => {
    mocks.access = { ok: false, message: "Not authorized." };
    expect(await assignRoleToUser(MEMBER, ROLE)).toEqual({
      ok: false,
      message: "Not authorized.",
    });
    expect(mocks.inserted).toEqual([]);
  });

  it("refuses a role at or above the caller's own rank", async () => {
    mocks.target = customRole({ rank: 3 });
    expect(await assignRoleToUser(MEMBER, ROLE)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/equal or higher authority/) as unknown,
    });
    expect(mocks.inserted).toEqual([]);
  });

  it("refuses the default role and a role that does not exist", async () => {
    mocks.target = customRole({ roleType: "default" });
    expect(await assignRoleToUser(MEMBER, ROLE)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/cannot be modified directly/) as unknown,
    });
    mocks.target = null;
    expect(await assignRoleToUser(MEMBER, ROLE)).toEqual({
      ok: false,
      message: "Role not found",
    });
  });

  it("refuses a synced role the caller's Discord account cannot manage", async () => {
    mocks.target = customRole({ discordRoleId: "d-role" });
    mocks.canManage = false;
    expect(await assignRoleToUser(MEMBER, ROLE)).toEqual({
      ok: false,
      message:
        "Your Discord account doesn't have permission to manage this role.",
    });
    expect(mocks.inserted).toEqual([]);
  });

  it("pushes a synced role to a member who has linked Discord", async () => {
    mocks.target = customRole({ discordRoleId: "d-role" });
    mocks.discordUserId = "disc-1";
    expect(await assignRoleToUser(MEMBER, ROLE)).toMatchObject({ ok: true });
    expect(mocks.push).toHaveBeenCalledWith("disc-1", "d-role", "add");
    expect(mocks.inserted).toHaveLength(2);
  });

  it("keeps the grant when the Discord push fails: the cron retries it", async () => {
    mocks.target = customRole({ discordRoleId: "d-role" });
    mocks.discordUserId = "disc-1";
    mocks.push.mockRejectedValue(new Error("Discord down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await assignRoleToUser(MEMBER, ROLE)).toMatchObject({ ok: true });
    expect(mocks.inserted).toEqual([{ userId: MEMBER, roleId: ROLE }]);
  });
});

describe("removeRoleFromUser", () => {
  it("removes a plain role and says so", async () => {
    expect(await removeRoleFromUser(MEMBER, ROLE)).toEqual({
      ok: true,
      message: "Role removed.",
    });
    expect(mocks.deleted).toBe(1);
    expect(mocks.revalidate).toHaveBeenCalled();
  });

  it("refuses a caller without canManageRoles, and removes nothing", async () => {
    mocks.access = { ok: false, message: "Not authorized." };
    expect(await removeRoleFromUser(MEMBER, ROLE)).toMatchObject({
      ok: false,
    });
    expect(mocks.deleted).toBe(0);
  });

  it("refuses a role the caller outranks nothing on", async () => {
    mocks.target = customRole({ rank: 1 });
    expect(await removeRoleFromUser(MEMBER, ROLE)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/equal or higher authority/) as unknown,
    });
    expect(mocks.deleted).toBe(0);
  });

  it("refuses a synced role above the caller's Discord roles, before removing", async () => {
    mocks.target = customRole({ discordRoleId: "d-role" });
    mocks.canManage = false;
    expect(await removeRoleFromUser(MEMBER, ROLE)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Discord account/) as unknown,
    });
    expect(mocks.deleted).toBe(0);
  });

  it("tells the caller the role is gone but Discord was not updated", async () => {
    mocks.target = customRole({ discordRoleId: "d-role" });
    mocks.discordUserId = "disc-1";
    mocks.push.mockRejectedValue(new Error("Discord down"));
    expect(await removeRoleFromUser(MEMBER, ROLE)).toEqual({
      ok: false,
      message: "Role removed, but Discord sync failed: Discord down",
    });
    // The database row went; the membership snapshot stays for the cron.
    expect(mocks.deleted).toBe(1);
  });
});
