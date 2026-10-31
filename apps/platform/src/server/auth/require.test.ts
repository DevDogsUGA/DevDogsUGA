import { beforeEach, describe, expect, it, vi } from "vitest";

const expectSession = vi.hoisted(() => vi.fn<() => Promise<string>>());
vi.mock("~/server/auth/access", () => ({
  requireDashboard: async () => {
    try {
      return { userId: await expectSession() };
    } catch {
      throw new Error("REDIRECT");
    }
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
  redirect: () => {
    throw new Error("REDIRECT");
  },
}));

import { requirePermission, requireSession } from "./require";

beforeEach(() => {
  expectSession.mockReset();
});

describe("requireSession", () => {
  it("returns the caller's id", async () => {
    expectSession.mockResolvedValue("u1");
    await expect(requireSession()).resolves.toBe("u1");
  });

  it("redirects a signed-out visitor to sign-in", async () => {
    expectSession.mockImplementation(async () => {
      throw new Error("no session");
    });
    const outcome = await requireSession().then(
      () => "returned",
      (error: Error) => error.message,
    );
    expect(outcome).toBe("REDIRECT");
  });
});

describe("requirePermission", () => {
  it("lets a permitted caller through", async () => {
    expectSession.mockResolvedValue("u1");
    await expect(requirePermission(async () => true)).resolves.toBe("u1");
  });

  it("shows the access-denied card to a signed-in caller who lacks it", async () => {
    expectSession.mockResolvedValue("u1");
    await expect(requirePermission(async () => false)).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("redirects a signed-out caller", async () => {
    expectSession.mockImplementation(async () => {
      throw new Error("no session");
    });
    const outcome = await requirePermission(async () => true).then(
      () => "returned",
      (error: Error) => error.message,
    );
    expect(outcome).toBe("REDIRECT");
  });
});
