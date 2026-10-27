import { describe, expect, it } from "vitest";
import type { ResolvedPermissions } from "~/server/actions/permissions";
import { visibleConsoleItems } from "./nav";

function permissions(on: Partial<ResolvedPermissions>): ResolvedPermissions {
  return { ...on } as ResolvedPermissions;
}

describe("Console → Apps nav entry", () => {
  it("shows for canManageOAuthApps and nobody else", () => {
    expect(
      visibleConsoleItems(permissions({ canManageOAuthApps: true })).map(
        (item) => item.href,
      ),
    ).toEqual(["/console/apps"]);
    expect(
      visibleConsoleItems(
        permissions({ canManageRoles: true, canModerate: true }),
      ).map((item) => item.href),
    ).not.toContain("/console/apps");
    expect(visibleConsoleItems(null)).toEqual([]);
  });
});
