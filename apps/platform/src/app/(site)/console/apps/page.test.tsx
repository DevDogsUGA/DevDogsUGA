import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  canManage: vi.fn(),
}));

vi.mock("~/server/auth/require", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("~/server/actions/permissions", () => ({
  canUserManageOAuthApps: mocks.canManage,
}));
vi.mock("~/server/loaders/oauthApps", () => ({ getConsoleApps: vi.fn() }));
vi.mock("~/components/Console/ConsoleShell", () => ({ default: () => null }));
vi.mock("~/components/Console/ConsoleAppsField", () => ({
  default: () => null,
}));

const { default: ConsoleAppsPage } = await import("./page");

beforeEach(() => vi.clearAllMocks());

describe("Console → Apps", () => {
  it("is gated on canManageOAuthApps before anything renders", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(ConsoleAppsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      mocks.canManage,
    );
  });

  it("renders for a holder", async () => {
    mocks.requirePermission.mockResolvedValue("holder");
    await expect(ConsoleAppsPage()).resolves.toBeTruthy();
  });
});
