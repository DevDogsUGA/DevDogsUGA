import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("~/env", () => ({ env: { DEPLOY_ENV: "development" } }));
vi.mock("~/supabase/proxy", () => ({
  updateSession: vi.fn(() => Promise.resolve(new Response(null))),
}));
import { NextRequest } from "next/server";
import { middleware } from "~/middleware";
import { HIDDEN_ROUTES, isHiddenRoute } from "./hiddenRoutes";
import { DASHBOARD_SECTIONS } from "./dashboard";
import {
  ACCOUNT_ITEMS,
  PROFILE_ITEMS,
  PUBLIC_LINKS,
  SEARCH_ONLY_PAGES,
} from "./nav";

describe("rollback route gate", () => {
  it.each(HIDDEN_ROUTES)(
    "keeps %s implemented but rewrites it to the normal 404 before auth",
    async (path) => {
      expect(
        existsSync(resolve("src/app/(site)", path.slice(1), "page.tsx")),
      ).toBe(true);
      for (const suffix of ["", "/child", "/child?tab=1"]) {
        const response = await middleware(
          new NextRequest(`https://devdogs.uga.edu${path}${suffix}`),
        );
        expect(response.status).toBe(404);
        expect(response.headers.get("x-middleware-rewrite")).toBe(
          "https://devdogs.uga.edu/rollback-not-found",
        );
      }
      expect(isHiddenRoute(`${path}-other`)).toBe(false);
      const encoded = path.replace(
        /[^/](?=[^/]*$)/,
        (letter) => `%${letter.charCodeAt(0).toString(16)}`,
      );
      expect(isHiddenRoute(encoded)).toBe(true);
    },
  );
  it("hides each meeting's graphics page but not the meeting or its siblings", async () => {
    expect(
      existsSync(
        resolve(
          "src/app/(site)/dashboard/meetings/[meetingId]/graphics/page.tsx",
        ),
      ),
    ).toBe(true);
    for (const path of [
      "/dashboard/meetings/abc/graphics",
      "/dashboard/meetings/abc/graphics/",
      "/dashboard/meetings/abc/graphics?x=1",
    ]) {
      expect(isHiddenRoute(path)).toBe(true);
      const response = await middleware(
        new NextRequest(`https://devdogs.uga.edu${path}`),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        "https://devdogs.uga.edu/rollback-not-found",
      );
    }
    for (const path of [
      "/dashboard/meetings",
      "/dashboard/meetings/abc",
      "/dashboard/meetings/abc/present",
      "/dashboard/meetings/abc/graphics-other",
    ]) {
      expect(isHiddenRoute(path)).toBe(false);
    }
  });
  it.each([
    "/dashboard/graphics/brand",
    "/dashboard/graphics/meetings/meeting/image",
    "/dashboard/graphics/meetings/meeting/zip",
  ])("preserves the API handler at %s", async (path) => {
    expect(isHiddenRoute(path)).toBe(false);
    const response = await middleware(
      new NextRequest(`https://devdogs.uga.edu${path}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
  it("omits hidden pages and the overview from all navigation sources", () => {
    for (const item of [
      ...DASHBOARD_SECTIONS,
      ...ACCOUNT_ITEMS,
      ...PROFILE_ITEMS,
      ...PUBLIC_LINKS,
      ...SEARCH_ONLY_PAGES,
    ]) {
      expect(isHiddenRoute(item.href)).toBe(false);
      expect(item.href).not.toBe("/dashboard");
    }
    expect(PUBLIC_LINKS.some((item) => item.label === "Contribute")).toBe(
      false,
    );
  });
  it("redirects only the overview temporarily; profile and connected accounts remain visible", async () => {
    const response = await middleware(
      new NextRequest("https://devdogs.uga.edu/dashboard"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://devdogs.uga.edu/dashboard/profile",
    );
    expect(isHiddenRoute("/dashboard/accounts")).toBe(false);
    expect(isHiddenRoute("/dashboard/profile")).toBe(false);
  });
});
