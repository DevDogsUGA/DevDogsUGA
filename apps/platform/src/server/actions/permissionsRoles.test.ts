import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "~/lib/actionResult";

/**
 * The role-definition actions in `permissions.ts` (create, update, delete,
 * reorder). Each returns an ActionResult: the rank and permission guards throw
 * ExpectedFailure, which comes back as the message the save bar and the
 * Commands show. The real guards run; the database and Discord are replaced.
 */

const mocks = vi.hoisted(() => ({
  /** What `authorize` answers; the caller outranks rank 1 and holds canModerate only. */
  access: null as { ok: boolean; message?: string; caller?: unknown } | null,
  /** The role row every select returns, or none. */
  target: null as null | Record<string, unknown>,
  inserted: [] as unknown[],
  updated: [] as unknown[],
  deleted: 0,
  push: vi.fn(),
  revalidate: vi.fn(),
}));

const CALLER = {
  ok: true,
  caller: {
    userId: "11111111-1111-4111-8111-111111111111",
    minRank: 3,
    flags: {
      canModerate: true,
      canManageRoles: true,
      canManageSuspensions: false,
      canViewAuditLog: false,
      canManageAttendance: false,
      canPreviewDocs: false,
      canManageOAuthApps: false,
      canDeleteAccounts: false,
      canReviewProjectReports: false,
    },
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
          return { returning: async () => [{ id: "new-role" }] };
        },
      }),
      update: () => ({
        set: (value: unknown) => {
          mocks.updated.push(value);
          return { where: async () => undefined };
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
vi.mock("~/server/discord/adminCapability", () => ({}));
vi.mock("~/server/discord/memberSync", () => ({}));
vi.mock("~/server/discord/roleSync", () => ({
  fetchGuildRoles: vi.fn(),
  pushRoleToDiscord: mocks.push,
}));
vi.mock("~/server/loaders/officers", () => ({
  revalidateOfficers: mocks.revalidate,
}));
vi.mock("~/supabase/drizzle/schema", () => ({ identitiesInAuth: {} }));

/** The refusal's message, failing the test if the action succeeded. */
function refused(result: ActionResult<unknown>): string {
  if (result.ok) throw new Error("Expected a refusal, got success.");
  return result.message;
}

const { createRole, updateRole, deleteRole, reorderRole } =
  await import("./permissions");

const customRole = (over: Record<string, unknown> = {}) => ({
  rank: 10,
  roleType: "custom",
  title: "Officer",
  color: "#112233",
  discordRoleId: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = CALLER;
  mocks.target = customRole();
  mocks.inserted = [];
  mocks.updated = [];
  mocks.deleted = 0;
  mocks.push.mockResolvedValue(undefined);
});

describe("updateRole", () => {
  it("returns success and writes the trimmed fields", async () => {
    const result = await updateRole("r", {
      title: "  Lead ",
      canModerate: true,
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.updated).toEqual([
      expect.objectContaining({ title: "Lead", canModerate: true }),
    ]);
    expect(mocks.revalidate).toHaveBeenCalled();
  });

  it("answers a caller without canManageRoles with a refusal and writes nothing", async () => {
    mocks.access = { ok: false, message: "Not authorized." };
    expect(await updateRole("r", { title: "x" })).toEqual({
      ok: false,
      message: "Not authorized.",
    });
    expect(mocks.updated).toEqual([]);
  });

  it("returns the rank guard's refusal for a role at or above the caller", async () => {
    mocks.target = customRole({ rank: 3 });
    expect(await updateRole("r", { title: "x" })).toEqual({
      ok: false,
      message:
        "Not authorized: cannot manage a role with equal or higher authority than your own",
    });
    expect(mocks.updated).toEqual([]);
  });

  it("returns the rank guard's refusal when the new rank is at or above the caller", async () => {
    expect(refused(await updateRole("r", { rank: 2 }))).toContain(
      "equal or higher authority",
    );
    expect(mocks.updated).toEqual([]);
  });

  it("returns the permission guard's refusal naming the permission", async () => {
    expect(await updateRole("r", { canManageSuspensions: true })).toEqual({
      ok: false,
      message:
        'Not authorized: you do not hold the "canManageSuspensions" permission',
    });
    expect(mocks.updated).toEqual([]);
  });

  it("refuses the built-in Member role and a role that does not exist", async () => {
    mocks.target = customRole({ roleType: "default", rank: null });
    expect(await updateRole("r", { title: "x" })).toEqual({
      ok: false,
      message: "Not authorized: this role cannot be modified directly",
    });
    mocks.target = null;
    expect(await updateRole("r", { title: "x" })).toEqual({
      ok: false,
      message: "Role not found",
    });
  });

  it("says so when the role saved but the Discord push failed", async () => {
    mocks.target = customRole({ discordRoleId: "999" });
    mocks.push.mockRejectedValue(new Error("Missing Permissions"));
    expect(await updateRole("r", { title: "Lead" })).toEqual({
      ok: false,
      message: "Role updated, but Discord sync failed: Missing Permissions",
    });
    expect(mocks.updated).toHaveLength(1);
  });

  it("lets an unexpected failure throw rather than disguising a bug as a refusal", async () => {
    mocks.target = customRole({ discordRoleId: null });
    mocks.revalidate.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(updateRole("r", { title: "x" })).rejects.toThrow("boom");
  });
});

describe("createRole, deleteRole and reorderRole", () => {
  it("creates a role and returns its id", async () => {
    expect(await createRole({ title: "Social", rank: 8 })).toEqual({
      ok: true,
      data: { id: "new-role" },
    });
    expect(mocks.inserted).toEqual([
      expect.objectContaining({ title: "Social", rank: 8 }),
    ]);
  });

  it("refuses a new role at the caller's rank or with a permission they lack", async () => {
    expect(refused(await createRole({ title: "Boss", rank: 3 }))).toContain(
      "equal or higher authority",
    );
    expect(
      refused(
        await createRole({ title: "Boss", rank: 8, canDeleteAccounts: true }),
      ),
    ).toContain('"canDeleteAccounts"');
    expect(mocks.inserted).toEqual([]);
  });

  it("deletes a role below the caller, and refuses one at or above", async () => {
    expect(await deleteRole("r")).toEqual({ ok: true });
    expect(mocks.deleted).toBe(1);

    mocks.target = customRole({ rank: 2 });
    expect(refused(await deleteRole("r"))).toContain(
      "equal or higher authority",
    );
    expect(mocks.deleted).toBe(1);
  });

  it("reorders to a rank below the caller, and refuses one at or above", async () => {
    expect(await reorderRole("r", 7.5)).toEqual({ ok: true });
    expect(mocks.updated).toEqual([{ rank: 7.5 }]);

    expect(refused(await reorderRole("r", 3))).toContain(
      "equal or higher authority",
    );
    expect(mocks.updated).toHaveLength(1);
  });

  it("refuses all three for a caller without canManageRoles", async () => {
    mocks.access = { ok: false, message: "Not authorized." };
    for (const result of [
      await createRole({ title: "x", rank: 9 }),
      await deleteRole("r"),
      await reorderRole("r", 9),
    ]) {
      expect(result).toEqual({ ok: false, message: "Not authorized." });
    }
    expect(mocks.inserted).toEqual([]);
    expect(mocks.deleted).toBe(0);
    expect(mocks.updated).toEqual([]);
  });
});
