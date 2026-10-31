import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The test-account Commands: add, rename, delete. Each returns an ActionResult;
 * the cap, a missing account and a name the form would not send are failures.
 * The database and Supabase are replaced.
 */

const OWNER = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  signedIn: true,
  testAccounts: [] as unknown[],
  email: "owner@uga.edu" as string | null,
  owned: true,
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  insertError: null as unknown,
  deletedRows: 0,
}));

vi.mock("~/server/auth/access", () => ({
  authorizeSession: () =>
    Promise.resolve(
      mocks.signedIn
        ? { ok: true, caller: { userId: OWNER } }
        : { ok: false, message: "Session expected but not found." },
    ),
}));
vi.mock("../auth", () => ({
  authenticate: () => Promise.reject(new Error("redirect:/auth")),
  expectUserWith: () =>
    Promise.resolve({
      id: OWNER,
      email: mocks.email,
      testAccounts: mocks.testAccounts,
    }),
}));
vi.mock("../db", () => ({
  db: {
    query: {
      oauthTestAccounts: {
        findFirst: async () =>
          mocks.owned ? { testUserId: ACCOUNT } : undefined,
      },
    },
    insert: () => ({
      values: async () => {
        if (mocks.insertError) throw mocks.insertError as Error;
      },
    }),
    delete: () => ({
      where: async () => {
        mocks.deletedRows += 1;
      },
    }),
  },
}));
vi.mock("../db/schema", () => ({ oauthTestAccounts: {} }));
vi.mock("~/supabase/admin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: mocks.createUser,
        updateUserById: mocks.updateUser,
        deleteUser: mocks.deleteUser,
      },
    },
  },
}));

const { addTestAccount, updateTestAccount, deleteTestAccount } =
  await import("./testAccounts");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signedIn = true;
  mocks.testAccounts = [];
  mocks.email = "owner@uga.edu";
  mocks.owned = true;
  mocks.insertError = null;
  mocks.deletedRows = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.createUser.mockImplementation(({ id }: { id: string }) =>
    Promise.resolve({ data: { user: { id } }, error: null }),
  );
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
});

describe("addTestAccount", () => {
  it("creates the account and returns what the list shows", async () => {
    const result = await addTestAccount(form({ displayName: "Jane Doe" }));
    expect(result).toMatchObject({
      ok: true,
      data: { displayName: "Jane Doe" },
      message: "Test account added",
    });
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        user_metadata: expect.objectContaining({ name: "Jane Doe" }) as unknown,
      }),
    );
  });

  it("refuses a sixth account", async () => {
    mocks.testAccounts = [1, 2, 3, 4, 5];
    expect(await addTestAccount(form({ displayName: "Jane" }))).toEqual({
      ok: false,
      message: "A maximum of 5 test accounts are allowed",
    });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("refuses a blank or oversized name before touching Supabase", async () => {
    for (const displayName of ["", "x".repeat(256)]) {
      expect(await addTestAccount(form({ displayName }))).toEqual({
        ok: false,
        message: "Enter a display name of up to 255 characters.",
      });
    }
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("says so when Supabase refuses, and when the row cannot be written", async () => {
    mocks.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "boom" },
    });
    expect(await addTestAccount(form({ displayName: "Jane" }))).toEqual({
      ok: false,
      message: "Failed to create test account. Please try again.",
    });

    mocks.insertError = new Error("fk");
    expect(await addTestAccount(form({ displayName: "Jane" }))).toEqual({
      ok: false,
      message: "Failed to create test account.",
    });
    // The orphaned sign-in is removed again.
    expect(mocks.deleteUser).toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in", async () => {
    mocks.signedIn = false;
    await expect(addTestAccount(form({ displayName: "Jane" }))).rejects.toThrow(
      "redirect:/auth",
    );
  });
});

describe("updateTestAccount", () => {
  it("renames the member's own account", async () => {
    expect(
      await updateTestAccount(
        form({ testUserId: ACCOUNT, displayName: "Janet" }),
      ),
    ).toEqual({
      ok: true,
      data: { testUserId: ACCOUNT, displayName: "Janet" },
      message: "Test account updated",
    });
  });

  it("refuses an account that is not the member's, and one the form would not send", async () => {
    mocks.owned = false;
    expect(
      await updateTestAccount(
        form({ testUserId: ACCOUNT, displayName: "Janet" }),
      ),
    ).toEqual({ ok: false, message: "Test account not found" });
    expect(
      await updateTestAccount(form({ testUserId: "nope", displayName: "x" })),
    ).toEqual({
      ok: false,
      message: "Enter a display name of up to 255 characters.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("says so when Supabase refuses the rename", async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: "boom" } });
    expect(
      await updateTestAccount(
        form({ testUserId: ACCOUNT, displayName: "Janet" }),
      ),
    ).toEqual({ ok: false, message: "Failed to update test user." });
  });
});

describe("deleteTestAccount", () => {
  it("deletes the sign-in and the row", async () => {
    expect(await deleteTestAccount(ACCOUNT)).toEqual({
      ok: true,
      message: "Test account deleted",
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith(ACCOUNT);
    expect(mocks.deletedRows).toBe(1);
  });

  it("refuses an account that is not the member's, and deletes nothing", async () => {
    mocks.owned = false;
    expect(await deleteTestAccount(ACCOUNT)).toEqual({
      ok: false,
      message: "Test account not found",
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    mocks.signedIn = false;
    expect(await deleteTestAccount(ACCOUNT)).toMatchObject({ ok: false });
  });
});
