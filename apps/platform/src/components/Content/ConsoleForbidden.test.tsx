import { beforeEach, describe, expect, it, vi } from "vitest";

const expectSession = vi.hoisted(() => vi.fn());
const getCallerContext = vi.hoisted(() => vi.fn());
const getHeader = vi.hoisted(() => vi.fn());
vi.mock("~/server/auth", () => ({ expectSession }));
vi.mock("~/server/actions/permissions", () => ({ getCallerContext }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: getHeader }),
}));

vi.mock("./AccessDenied", () => ({
  default: function AccessDenied() {
    return null;
  },
}));
vi.mock("./NotFoundPage", () => ({
  default: function NotFoundPage() {
    return null;
  },
}));

import AccessDenied from "./AccessDenied";
import ConsoleForbidden from "./ConsoleForbidden";
import NotFoundPage from "./NotFoundPage";

beforeEach(() => {
  expectSession.mockReset();
  getCallerContext.mockReset();
  getHeader.mockReset();
});

describe("ConsoleForbidden", () => {
  it("shows the 404 to a signed-out caller", async () => {
    expectSession.mockRejectedValue(new Error("no session"));
    const el = await ConsoleForbidden();
    expect(el.type).toBe(NotFoundPage);
  });

  it("shows the general card to a member with no console permission", async () => {
    expectSession.mockResolvedValue("u1");
    getCallerContext.mockResolvedValue({ resolvedPermissions: {} });
    getHeader.mockReturnValue("/console");
    const el = await ConsoleForbidden();
    expect(el.type).toBe(AccessDenied);
    expect(el.props).toEqual({ section: null, consoleHref: null });
  });

  it("names the section for an officer missing its permission", async () => {
    expectSession.mockResolvedValue("u1");
    getCallerContext.mockResolvedValue({
      resolvedPermissions: { canManageAttendance: true },
    });
    getHeader.mockReturnValue("/console/audit-log");
    const el = await ConsoleForbidden();
    expect(el.type).toBe(AccessDenied);
    expect(el.props).toEqual({
      section: "Audit Log",
      consoleHref: "/console/attendance",
    });
  });
});
