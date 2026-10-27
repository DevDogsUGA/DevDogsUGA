// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { API_URL: "http://api", PUBLISHABLE_KEY: "pk" },
}));
vi.mock("~/supabase/admin", () => ({ supabaseAdmin: {} }));

const auth = vi.hoisted(() => ({
  oauth: {
    getAuthorizationDetails: vi.fn(),
    approveAuthorization: vi.fn(),
    denyAuthorization: vi.fn(),
  },
}));
vi.mock("~/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth }),
}));

import { approveAs, denyAs } from "./asAccount";

beforeEach(() => vi.clearAllMocks());

describe("approveAs (self)", () => {
  it("approves a first-time authorization through GoTrue's consent flow", async () => {
    auth.oauth.getAuthorizationDetails.mockResolvedValue({
      data: { client: {} },
      error: null,
    });
    auth.oauth.approveAuthorization.mockResolvedValue({
      data: { redirect_url: "https://app.example/cb?code=1" },
      error: null,
    });
    await expect(approveAs({ kind: "self" }, "auth-1")).resolves.toBe(
      "https://app.example/cb?code=1",
    );
    expect(auth.oauth.approveAuthorization).toHaveBeenCalledWith("auth-1", {
      skipBrowserRedirect: true,
    });
  });

  it("returns the existing redirect without approving twice", async () => {
    auth.oauth.getAuthorizationDetails.mockResolvedValue({
      data: { redirect_url: "https://app.example/cb?code=2" },
      error: null,
    });
    await expect(approveAs({ kind: "self" }, "auth-1")).resolves.toBe(
      "https://app.example/cb?code=2",
    );
    expect(auth.oauth.approveAuthorization).not.toHaveBeenCalled();
  });
});

describe("denyAs (self)", () => {
  beforeEach(() => {
    auth.oauth.getAuthorizationDetails.mockResolvedValue({
      data: { client: {} },
      error: null,
    });
  });

  it("binds the authorization to the account before denying", async () => {
    const order: string[] = [];
    auth.oauth.getAuthorizationDetails.mockImplementation(async () => {
      order.push("details");
      return { data: { client: {} }, error: null };
    });
    auth.oauth.denyAuthorization.mockImplementation(async () => {
      order.push("deny");
      return {
        data: { redirect_url: "https://app.example/cb?error=x" },
        error: null,
      };
    });
    await denyAs({ kind: "self" }, "auth-1");
    expect(order).toEqual(["details", "deny"]);
  });

  it("answers access_denied, never a code, when it was already approved", async () => {
    auth.oauth.getAuthorizationDetails.mockResolvedValue({
      data: { redirect_url: "https://app.example/cb?code=3&state=xyz" },
      error: null,
    });
    const url = new URL(await denyAs({ kind: "self" }, "auth-1"));
    expect(url.origin + url.pathname).toBe("https://app.example/cb");
    expect(url.searchParams.get("code")).toBeNull();
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(auth.oauth.denyAuthorization).not.toHaveBeenCalled();
  });

  it("returns the redirect GoTrue builds with error=access_denied", async () => {
    auth.oauth.denyAuthorization.mockResolvedValue({
      data: { redirect_url: "https://app.example/cb?error=access_denied" },
      error: null,
    });
    await expect(denyAs({ kind: "self" }, "auth-1")).resolves.toBe(
      "https://app.example/cb?error=access_denied",
    );
    expect(auth.oauth.denyAuthorization).toHaveBeenCalledWith("auth-1", {
      skipBrowserRedirect: true,
    });
  });

  it("throws when GoTrue refuses", async () => {
    auth.oauth.denyAuthorization.mockResolvedValue({
      data: null,
      error: new Error("nope"),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(denyAs({ kind: "self" }, "auth-1")).rejects.toThrow();
  });
});
