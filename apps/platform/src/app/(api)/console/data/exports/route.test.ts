// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const session = vi.fn<() => Promise<string>>();
const allowed = vi.fn<(id: string) => Promise<boolean>>();
const prepare = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("~/server/auth", () => ({ expectSession: () => session() }));
vi.mock("~/server/actions/permissions", () => ({
  canUserManageAttendance: (id: string) => allowed(id),
}));
vi.mock("~/server/exports/deps", () => ({ exportDeps: {} }));
vi.mock("~/server/exports/run", () => ({
  prepareExport: (...args: unknown[]) => prepare(...args),
}));

import { POST } from "./route";

const post = (headers: Record<string, string> = {}, body: unknown = {}) =>
  POST(
    new Request("http://localhost/console/data/exports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "same-origin",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  session.mockReset().mockResolvedValue("officer-1");
  allowed.mockReset().mockResolvedValue(true);
  prepare.mockReset().mockResolvedValue({ kind: "error", message: "x" });
});

describe("POST /console/data/exports", () => {
  it("refuses a cross-site request before anything else", async () => {
    const res = await post({ "Sec-Fetch-Site": "cross-site" });
    expect(res.status).toBe(403);
    expect(session).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("refuses a request that does not say where it came from", async () => {
    const res = await POST(
      new Request("http://localhost/console/data/exports", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("refuses signed-out callers", async () => {
    session.mockRejectedValue(new Error("no session"));
    expect((await post()).status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("refuses members without canManageAttendance", async () => {
    allowed.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(403);
    expect(allowed).toHaveBeenCalledWith("officer-1");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    expect((await post({}, "not json")).status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("prepares the export under the signed-in officer", async () => {
    const body = { kind: "attendance" };
    await post({}, body);
    expect(prepare).toHaveBeenCalledWith(body, "officer-1", {});
  });
});
