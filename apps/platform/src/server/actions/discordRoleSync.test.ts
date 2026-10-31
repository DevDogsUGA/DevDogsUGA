import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";

/**
 * The Discord role-sync Commands. Each returns an ActionResult: the rank
 * guard, a Discord role the caller may not manage and Discord itself refusing
 * come back as the message the dialog shows. The real guards run; the
 * database and Discord are replaced.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const ROLE = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  access: null as { ok: boolean; message?: string; caller?: unknown } | null,
  target: null as null | Record<string, unknown>,
  guildRoles: [{ id: "d-role", position: 4 }] as {
    id: string;
    position: number;
  }[],
  guildError: null as Error | null,
  canManage: true,
  link: vi.fn(),
  create: vi.fn(),
  unsync: vi.fn(),
  importRole: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("~/server/auth", () => ({ expectSession: vi.fn() }));
vi.mock("~/server/auth/access", () => ({
  authorize: () => Promise.resolve(mocks.access),
  rules: { manageRoles: () => true },
}));
vi.mock("~/server/db", () => ({
  db: {
    select: () => {
      const builder: Record<string, unknown> = {};
      for (const method of ["from", "where", "limit"]) {
        builder[method] = () => builder;
      }
      builder.then = (resolve: (rows: unknown[]) => unknown) =>
        resolve(mocks.target ? [mocks.target] : []);
      return builder;
    },
  },
}));
vi.mock("~/server/db/schema", () => ({
  roles: { id: "id", rank: "rank", roleType: "roleType" },
}));
vi.mock("~/server/loaders/officers", () => ({
  revalidateOfficers: mocks.revalidate,
}));
vi.mock("~/server/discord/adminCapability", () => ({
  getDiscordSyncCapability: async () => ({}),
  canManageDiscordRolePosition: () => mocks.canManage,
}));
vi.mock("~/server/discord/roleSync", () => ({
  fetchGuildRoles: () =>
    mocks.guildError
      ? Promise.reject(mocks.guildError)
      : Promise.resolve(mocks.guildRoles),
  importRoleFromDiscord: mocks.importRole,
  linkRoleToDiscord: mocks.link,
  createDiscordRoleFromRole: mocks.create,
  unsyncRole: mocks.unsync,
  listImportableDiscordRoles: vi.fn(),
}));

const {
  importRoleFromDiscord,
  linkRoleToDiscord,
  createDiscordRoleFromRole,
  unsyncRole,
} = await import("./discordRoleSync");

const CALLER = {
  ok: true,
  caller: { userId: USER, minRank: 3, flags: { canManageRoles: true } },
};
const FIELDS = { rank: 10, showOnProfile: true, isLeadership: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = CALLER;
  mocks.target = { rank: 10, roleType: "custom" };
  mocks.guildRoles = [{ id: "d-role", position: 4 }];
  mocks.guildError = null;
  mocks.canManage = true;
  mocks.link.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue(undefined);
  mocks.unsync.mockResolvedValue(undefined);
  mocks.importRole.mockResolvedValue({ id: "new-role" });
});

describe("importRoleFromDiscord", () => {
  it("imports and returns the new role's id", async () => {
    expect(await importRoleFromDiscord("d-role", FIELDS)).toEqual({
      ok: true,
      data: { id: "new-role" },
      message: "Role imported from Discord.",
    });
  });

  it("refuses a rank at or above the caller's own", async () => {
    expect(
      await importRoleFromDiscord("d-role", { ...FIELDS, rank: 3 }),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/equal or higher authority/) as unknown,
    });
    expect(mocks.importRole).not.toHaveBeenCalled();
  });

  it("refuses a permission the caller does not hold", async () => {
    expect(
      await importRoleFromDiscord("d-role", {
        ...FIELDS,
        canDeleteAccounts: true,
      }),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/canDeleteAccounts/) as unknown,
    });
    expect(mocks.importRole).not.toHaveBeenCalled();
  });

  it("says when the Discord role is gone", async () => {
    expect(await importRoleFromDiscord("missing", FIELDS)).toEqual({
      ok: false,
      message: "Discord role not found",
    });
  });

  it("refuses a Discord role above the caller's own", async () => {
    mocks.canManage = false;
    expect(await importRoleFromDiscord("d-role", FIELDS)).toEqual({
      ok: false,
      message:
        "Your Discord account doesn't have permission to manage this role.",
    });
    expect(mocks.importRole).not.toHaveBeenCalled();
  });

  it("reports Discord itself failing as a refusal with its reason", async () => {
    mocks.guildError = new Error("429 rate limited");
    expect(await importRoleFromDiscord("d-role", FIELDS)).toEqual({
      ok: false,
      message: "Discord could not complete that: 429 rate limited",
    });
  });

  it("returns a refusal the domain step raises", async () => {
    mocks.importRole.mockRejectedValue(
      new ExpectedFailure("Discord role not found"),
    );
    expect(await importRoleFromDiscord("d-role", FIELDS)).toEqual({
      ok: false,
      message: "Discord role not found",
    });
  });

  it("refuses a caller without canManageRoles", async () => {
    mocks.access = { ok: false, message: "Not authorized." };
    expect(await importRoleFromDiscord("d-role", FIELDS)).toEqual({
      ok: false,
      message: "Not authorized.",
    });
  });
});

describe("linkRoleToDiscord", () => {
  it("links, refreshes the officers and says so", async () => {
    expect(await linkRoleToDiscord(ROLE, "d-role")).toEqual({
      ok: true,
      message: "Role linked to Discord.",
    });
    expect(mocks.link).toHaveBeenCalledWith(ROLE, "d-role");
    expect(mocks.revalidate).toHaveBeenCalled();
  });

  it("refuses the default role and an unknown role", async () => {
    mocks.target = { rank: 10, roleType: "default" };
    expect(await linkRoleToDiscord(ROLE, "d-role")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/cannot be modified directly/) as unknown,
    });
    mocks.target = null;
    expect(await linkRoleToDiscord(ROLE, "d-role")).toEqual({
      ok: false,
      message: "Role not found",
    });
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("refuses a Discord role the caller may not manage", async () => {
    mocks.canManage = false;
    expect(await linkRoleToDiscord(ROLE, "d-role")).toMatchObject({
      ok: false,
    });
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("reports Discord refusing the link", async () => {
    mocks.link.mockRejectedValue(new Error("Missing Permissions"));
    expect(await linkRoleToDiscord(ROLE, "d-role")).toEqual({
      ok: false,
      message: "Discord could not complete that: Missing Permissions",
    });
  });
});

describe("createDiscordRoleFromRole", () => {
  it("creates the Discord role and says so", async () => {
    expect(await createDiscordRoleFromRole(ROLE)).toEqual({
      ok: true,
      message: "Created the Discord role and linked it.",
    });
    expect(mocks.create).toHaveBeenCalledWith(ROLE);
  });

  it("refuses a caller who cannot create Discord roles", async () => {
    mocks.canManage = false;
    expect(await createDiscordRoleFromRole(ROLE)).toEqual({
      ok: false,
      message:
        "Your Discord account doesn't have permission to create Discord roles.",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns a role that is already synced as a failure", async () => {
    mocks.create.mockRejectedValue(
      new ExpectedFailure("Role is already synced with Discord"),
    );
    expect(await createDiscordRoleFromRole(ROLE)).toEqual({
      ok: false,
      message: "Role is already synced with Discord",
    });
  });
});

describe("unsyncRole", () => {
  it("clears the link and says so", async () => {
    expect(await unsyncRole(ROLE)).toEqual({
      ok: true,
      message: "Role unsynced from Discord.",
    });
    expect(mocks.unsync).toHaveBeenCalledWith(ROLE);
  });

  it("refuses a role at the caller's own rank", async () => {
    mocks.target = { rank: 3, roleType: "custom" };
    expect(await unsyncRole(ROLE)).toMatchObject({ ok: false });
    expect(mocks.unsync).not.toHaveBeenCalled();
  });

  it("lets a database failure throw", async () => {
    mocks.unsync.mockRejectedValue(new Error("connection reset"));
    await expect(unsyncRole(ROLE)).rejects.toThrow("connection reset");
  });
});
