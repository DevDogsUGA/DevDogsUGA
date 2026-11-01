import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The read actions in `permissions.ts`. The file is `"use server"`, so the
 * browser can call every export with any arguments: each one has to check the
 * caller itself, because the /console/permissions page gate does not cover a
 * direct call. The database and Supabase are replaced; what is pinned here is
 * that a signed-in member without `canManageRoles` learns nothing.
 */

const CALLER = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  /** `null` is a signed-out caller, which `expectSession` rejects. */
  session: null as string | null,
  /** The caller's `resolvedUserPermissions` row; `null` is a plain member. */
  permissionRow: null as null | Record<string, unknown>,
  selects: 0,
  emailLookups: [] as string[],
}));

vi.mock("~/server/auth", () => ({
  expectSession: () =>
    mocks.session
      ? Promise.resolve(mocks.session)
      : Promise.reject(new Error("Not signed in")),
}));
vi.mock("~/server/db", () => {
  // Every query resolves to the caller's permission row (or nothing), which
  // is all the gate reads; an allowed call then reaches the empty-result path.
  const query = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "where", "innerJoin", "orderBy", "limit"]) {
      builder[method] = () => builder;
    }
    builder.then = (resolve: (rows: unknown[]) => unknown) =>
      resolve(mocks.permissionRow ? [mocks.permissionRow] : []);
    return builder;
  };
  return {
    db: {
      select: () => {
        mocks.selects += 1;
        return query();
      },
    },
  };
});
vi.mock("~/supabase/admin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: (id: string) => {
          mocks.emailLookups.push(id);
          return Promise.resolve({ data: { user: { email: "a@b.c" } } });
        },
      },
    },
  },
}));
vi.mock("~/server/discord/adminCapability", () => ({}));
vi.mock("~/server/discord/memberSync", () => ({}));
vi.mock("~/server/discord/roleSync", () => ({}));
vi.mock("~/server/loaders/officers", () => ({ revalidateOfficers: vi.fn() }));
vi.mock("~/supabase/drizzle/schema", () => ({ identitiesInAuth: {} }));

const { searchUsers, getUserResolvedPermissions } =
  await import("./permissions");

function permissionRow(canManageRoles: boolean) {
  return {
    canModerate: false,
    canManageRoles,
    canManageSuspensions: false,
    canViewAuditLog: false,
    canManageAttendance: false,
    canPreviewDocs: false,
    canManageOAuthApps: false,
    canDeleteAccounts: false,
    minRank: 5,
    isLeader: false,
  };
}

beforeEach(() => {
  mocks.session = CALLER;
  mocks.permissionRow = null;
  mocks.selects = 0;
  mocks.emailLookups.length = 0;
});

describe("searchUsers", () => {
  it("refuses a signed-in member without canManageRoles, before any lookup", async () => {
    mocks.permissionRow = permissionRow(false);
    await expect(searchUsers("sloan")).rejects.toThrow(
      "Not authorized: canManageRoles required",
    );
    // Only the gate's own permission read ran: no profile query, no email.
    expect(mocks.selects).toBe(1);
    expect(mocks.emailLookups).toEqual([]);
  });

  it("refuses a member with no role assignments at all", async () => {
    await expect(searchUsers("sloan")).rejects.toThrow("Not authorized");
    expect(mocks.emailLookups).toEqual([]);
  });

  it("refuses a signed-out caller", async () => {
    mocks.session = null;
    await expect(searchUsers("sloan")).rejects.toThrow("Not signed in");
    expect(mocks.selects).toBe(0);
  });

  it("lets a caller with canManageRoles through the gate", async () => {
    mocks.permissionRow = permissionRow(true);
    await expect(searchUsers("   ")).resolves.toEqual([]);
  });
});

describe("getUserResolvedPermissions", () => {
  it("refuses a signed-in member without canManageRoles", async () => {
    mocks.permissionRow = permissionRow(false);
    await expect(getUserResolvedPermissions(TARGET)).rejects.toThrow(
      "Not authorized: canManageRoles required",
    );
    expect(mocks.selects).toBe(1);
  });

  it("refuses a member asking about themselves", async () => {
    mocks.permissionRow = permissionRow(false);
    await expect(getUserResolvedPermissions(CALLER)).rejects.toThrow(
      "Not authorized",
    );
  });

  it("returns the target's roles and permissions to a role manager", async () => {
    mocks.permissionRow = permissionRow(true);
    const result = await getUserResolvedPermissions(TARGET);
    expect(result.resolved.canManageRoles).toBe(true);
  });
});
