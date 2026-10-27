import { beforeEach, describe, expect, it, vi } from "vitest";

const expectSession = vi.hoisted(() => vi.fn());
vi.mock("~/server/auth", () => ({ expectSession }));
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

  it("answers a signed-out visitor with the 404, never a sign-in redirect", async () => {
    expectSession.mockImplementation(async () => {
      throw new Error("no session");
    });
    const outcome = await requireSession().then(
      () => "returned",
      (error: Error) => error.message,
    );
    expect(outcome).toBe("NOT_FOUND");
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

  it("keeps a signed-out caller on the 404", async () => {
    expectSession.mockImplementation(async () => {
      throw new Error("no session");
    });
    const outcome = await requirePermission(async () => true).then(
      () => "returned",
      (error: Error) => error.message,
    );
    expect(outcome).toBe("NOT_FOUND");
  });
});
