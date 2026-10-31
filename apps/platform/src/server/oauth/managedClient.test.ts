import { describe, expect, it, vi } from "vitest";
import type { Caller } from "~/server/auth/access";

vi.mock("~/server/auth/access", () => ({
  rules: {
    manageOAuthApps: (caller: Caller) => caller.flags.canManageOAuthApps,
  },
}));

const { mayManageClient } = await import("./managedClient");

function caller(userId: string, canManageOAuthApps = false): Caller {
  return {
    userId,
    flags: { canManageOAuthApps } as Caller["flags"],
    isLeader: false,
    minRank: Infinity,
  };
}

describe("mayManageClient", () => {
  it("lets an owner manage their own app and no one else's", () => {
    expect(mayManageClient({ userId: "ada" }, caller("ada"))).toBe(true);
    expect(mayManageClient({ userId: "ada" }, caller("grace"))).toBe(false);
  });

  it("does not let a holder manage a member's app", () => {
    expect(mayManageClient({ userId: "ada" }, caller("grace", true))).toBe(
      false,
    );
  });

  it("lets only a holder manage a DevDogs app", () => {
    expect(mayManageClient({ userId: null }, caller("grace", true))).toBe(true);
    expect(mayManageClient({ userId: null }, caller("grace"))).toBe(false);
  });
});
