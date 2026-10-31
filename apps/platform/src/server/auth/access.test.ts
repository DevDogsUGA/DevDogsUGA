import { beforeEach, describe, expect, it, vi } from "vitest";

// React's request cache is an identity outside RSC. Replace its result so the
// actions can exercise the exported loader without opening a database.
vi.mock("react", () => ({ cache: () => vi.fn() }));
vi.mock("~/server/auth", () => ({ expectSession: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-request-path": requestPath }),
}));
let requestPath = "/dashboard";

vi.mock("./permissions", () => ({ getCallerContext: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
  redirect: (url: string) => {
    throw new Error(url);
  },
  forbidden: () => {
    throw new Error("403");
  },
}));

import UnknownDashboardPage from "~/app/(site)/dashboard/[...slug]/page";

import {
  authorize,
  authorizeSession,
  loadCaller,
  requireAccess,
  requireDashboard,
  rules,
  type Caller,
} from "./access";

const member = (): Caller => ({
  userId: "member",
  isLeader: false,
  minRank: Infinity,
  flags: {
    canModerate: false,
    canManageRoles: false,
    canManageSuspensions: false,
    canViewAuditLog: false,
    canManageAttendance: false,
    canPreviewDocs: false,
    canManageOAuthApps: false,
    canDeleteAccounts: false,
    canReviewProjectReports: false,
  },
});

beforeEach(() => vi.mocked(loadCaller).mockReset());

describe("Access rules", () => {
  const flags = {
    manageAttendance: "canManageAttendance",
    moderate: "canModerate",
    manageSuspensions: "canManageSuspensions",
    viewAuditLog: "canViewAuditLog",
    manageRoles: "canManageRoles",
    manageOAuthApps: "canManageOAuthApps",
    previewDocs: "canPreviewDocs",
    deleteAccounts: "canDeleteAccounts",
    reviewProjectReports: "canReviewProjectReports",
  } as const;
  for (const [rule, flag] of Object.entries(flags)) {
    it(`${rule} requires only ${flag}`, () => {
      const caller = member();
      expect(rules[rule as keyof typeof flags](caller)).toBe(false);
      caller.isLeader = true;
      expect(rules[rule as keyof typeof flags](caller)).toBe(false);
      caller.flags[flag] = true;
      expect(rules[rule as keyof typeof flags](caller)).toBe(true);
    });
  }
  it("officers and attendance managers can use graphics", () => {
    const caller = member();
    expect(rules.officer(caller)).toBe(false);
    expect(rules.useGraphics(caller)).toBe(false);
    caller.flags.canManageAttendance = true;
    expect(rules.useGraphics(caller)).toBe(true);
    expect(rules.officer(caller)).toBe(false);
    caller.flags.canManageAttendance = false;
    caller.isLeader = true;
    expect(rules.useGraphics(caller)).toBe(true);
    expect(rules.officer(caller)).toBe(true);
  });
});

it("refuses signed-out actions without evaluating a rule", async () => {
  vi.mocked(loadCaller).mockResolvedValue(null);
  const rule = vi.fn();
  expect(await authorize(rule)).toEqual({
    ok: false,
    message: "Session expected but not found.",
  });
  expect(rule).not.toHaveBeenCalled();
  expect((await authorizeSession()).ok).toBe(false);
});
it("returns a refusal or the same Caller", async () => {
  const caller = member();
  vi.mocked(loadCaller).mockResolvedValue(caller);
  expect(await authorize(rules.officer)).toEqual({
    ok: false,
    message: "Not authorized.",
  });
  expect(await authorizeSession()).toEqual({ ok: true, caller });
  caller.isLeader = true;
  expect(await authorize(rules.officer)).toEqual({ ok: true, caller });
});
it("redirects signed-out callers and keeps the 403 for refused members", async () => {
  vi.mocked(loadCaller).mockResolvedValue(null);
  await expect(requireAccess(rules.officer)).rejects.toThrow(
    "/auth?callbackPath=%2Fdashboard",
  );
  vi.mocked(loadCaller).mockResolvedValue(member());
  await expect(requireAccess(rules.officer)).rejects.toThrow("403");
  const caller = { ...member(), isLeader: true };
  vi.mocked(loadCaller).mockResolvedValue(caller);
  expect(await requireAccess(rules.officer)).toBe(caller);
});

it.each([
  "/dashboard",
  "/dashboard/profile?tab=links&next=%2Fevents",
  "/dashboard/x?unknown=yes",
  "/dashboard/a/b?x=1",
])("preserves %s for signed-out visitors", async (path) => {
  requestPath = path;
  vi.mocked(loadCaller).mockResolvedValue(null);
  await expect(requireDashboard()).rejects.toThrow(
    `/auth?callbackPath=${encodeURIComponent(path)}`,
  );
});

it("gates unknown pages before their not-found boundary", async () => {
  requestPath = "/dashboard/unknown?x=1";
  vi.mocked(loadCaller).mockResolvedValue(null);
  await expect(UnknownDashboardPage()).rejects.toThrow(
    "/auth?callbackPath=%2Fdashboard%2Funknown%3Fx%3D1",
  );
});

it("returns 404 for an unknown page after sign-in", async () => {
  vi.mocked(loadCaller).mockResolvedValue(member());
  await expect(UnknownDashboardPage()).rejects.toThrow("404");
});
