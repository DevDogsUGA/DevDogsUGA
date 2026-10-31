// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalPath } from "./approvalPath";
import ConnectPage from "./connect/page";
import DevicePage from "./device/page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(url);
  }),
}));
vi.mock("~/server/auth", () => ({ expectUserWith: vi.fn() }));
vi.mock("~/server/actions/oauthConnect", () => ({
  approveConnect: vi.fn(),
  denyConnect: vi.fn(),
}));
vi.mock("~/server/actions/oauthDevice", () => ({
  approveDevice: vi.fn(),
  denyDevice: vi.fn(),
}));
vi.mock("~/server/oauth/connectParams", () => ({
  parseConnectParams: vi.fn(() => ({ ok: false, error: "Invalid request" })),
}));
vi.mock("~/server/oauth/deviceCodes", () => ({
  formatUserCode: vi.fn(),
  normalizeUserCode: vi.fn(),
}));
vi.mock("~/server/oauth/verifyDeviceCode", () => ({
  verifyDeviceUserCode: vi.fn(),
}));
import { expectUserWith } from "~/server/auth";

describe("CLI approval sign-in", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves empty and repeated query values without inventing a query on bare URLs", () => {
    expect(approvalPath("/oauth/device", {})).toBe("/oauth/device");
    expect(
      approvalPath("/oauth/connect", { state: ["a/b", ""], absent: undefined }),
    ).toBe("/oauth/connect?state=a%2Fb&state=");
  });

  it.each([
    ["/oauth/connect", ConnectPage],
    ["/oauth/device", DevicePage],
  ] as const)(
    "gates %s before rendering even an invalid or empty request",
    async (path, Page) => {
      vi.mocked(expectUserWith).mockRejectedValueOnce(new Error("signed out"));
      const params = { state: ["a/b", "second"], user_code: "ABCD-EFGH" };
      await expect(
        Page({ searchParams: Promise.resolve(params) }),
      ).rejects.toThrow(
        `/auth?callbackPath=${encodeURIComponent(approvalPath(path, params))}`,
      );
      expect(expectUserWith).toHaveBeenCalledWith({
        profile: true,
        githubIdentity: { columns: { id: true } },
      });
    },
  );
});
