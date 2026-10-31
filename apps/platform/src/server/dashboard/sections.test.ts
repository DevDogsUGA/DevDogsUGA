import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("~/server/auth", () => ({ expectSession: vi.fn() }));
vi.mock("~/server/auth/permissions", () => ({ getCallerContext: vi.fn() }));
import { DASHBOARD_SECTIONS } from "~/config/dashboard";
import { rules, type Caller } from "~/server/auth/access";
import { matchTerminalPath, TERMINAL_PATHS } from "~/terminal/paths";
import { sectionFor, visibleSections } from "./sections";

const flags: Caller["flags"] = {
  canModerate: false,
  canManageRoles: false,
  canManageSuspensions: false,
  canViewAuditLog: false,
  canManageAttendance: false,
  canPreviewDocs: false,
  canManageOAuthApps: false,
  canDeleteAccounts: false,
  canReviewProjectReports: false,
};
const callers: Caller[] = [false, true].flatMap((isLeader) =>
  Array.from({ length: 2 ** Object.keys(flags).length }, (_, mask) => ({
    userId: "member",
    minRank: Infinity,
    isLeader,
    flags: Object.fromEntries(
      Object.keys(flags).map((key, i) => [key, Boolean(mask & (1 << i))]),
    ) as Caller["flags"],
  })),
);

describe("Section registry", () => {
  it("hides every section when signed out", () =>
    expect(visibleSections(null)).toEqual([]));
  it.each(DASHBOARD_SECTIONS)(
    "resolves $id for every combination of grants",
    (section) => {
      for (const caller of callers) {
        expect(visibleSections(caller).includes(section)).toBe(
          section.access === "member" || rules[section.access](caller),
        );
      }
    },
  );
  it.each(DASHBOARD_SECTIONS)("owns $href and its descendants", (section) => {
    expect(sectionFor(section.href)).toBe(section);
    expect(sectionFor(`${section.href}/child?x=1#anchor`)).toBe(section);
    expect(sectionFor(`${section.href}-unknown`)).not.toBe(section);
  });
  it("rejects unowned paths", () => {
    expect(sectionFor(null)).toBeNull();
    expect(sectionFor("/console")).toBeNull();
  });
  it.each(DASHBOARD_SECTIONS)("has a terminal twin for $href", (section) =>
    expect(matchTerminalPath(section.href)).not.toBeNull(),
  );
});

const SRC = resolve(process.cwd(), "src");
const CONSOLE = resolve(SRC, "app/(site)/console");
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pages(resolve(dir, entry.name))
      : entry.name === "page.tsx"
        ? [resolve(dir, entry.name)]
        : [],
  );
}

/** Deliberate sub-page exceptions; a new stricter or different rule needs an edit here. */
const EXCEPTIONS: Record<string, keyof typeof rules> = {
  // Attendance records require attendance management; the list also serves graphics users.
  "/console/attendance/[meetingId]": "manageAttendance",
  // Different rule, not stricter: manageSuspensions is its own capability; a suspensions manager reaches this page by direct link or from a report.
  "/console/moderation/users/[userId]": "manageSuspensions",
};

/** These pages delegate their primary gate to a loader; auxiliary grants are not page gates. */
const LOADER_GATES: Record<string, [string, string]> = {
  "/console/permissions": [
    "server/loaders/permissions.ts",
    "getPermissionsPageData",
  ],
  "/console/moderation": [
    "server/loaders/moderation.ts",
    "getModerationPageData",
  ],
  "/console/moderation/[reportId]": [
    "server/loaders/moderation.ts",
    "getReportDetailData",
  ],
  "/console/moderation/users/[userId]": [
    "server/loaders/moderation.ts",
    "getUserModerationData",
  ],
  "/console/audit-log/[eventId]": [
    "server/loaders/auditLog.ts",
    "getAuditEventDetailData",
  ],
};

/** Extract a named loader body up to the next exported function. */
function loaderSource(file: string, name: string) {
  const source = readFileSync(resolve(SRC, file), "utf8");
  const start = Math.max(
    source.indexOf(`export const ${name} =`),
    source.indexOf(`function ${name}(`),
  );
  expect(start, name).toBeGreaterThanOrEqual(0);
  return source
    .slice(start)
    .split(/\nexport (?:const |(?:async )?function )/)[0]!;
}

describe("console page access drift", () => {
  it.each(pages(CONSOLE))("has a terminal twin for %s", (file) => {
    expect(
      TERMINAL_PATHS.some(
        (entry) => entry.page === relative(resolve(SRC, "app"), file),
      ),
    ).toBe(true);
  });
  it.each(pages(CONSOLE))(
    "matches its section or an explicit sub-page exception: %s",
    (file) => {
      const path =
        "/console/" + relative(CONSOLE, file).replace(/\/page\.tsx$/, "");
      const section = sectionFor(path);
      expect(section, path).not.toBeNull();
      const source = readFileSync(file, "utf8");
      const expected = EXCEPTIONS[path] ?? section!.access;
      // D3 owns advisor visibility. Both project pages already apply an officer-or-advisor record gate.
      if (path.startsWith("/console/projects")) {
        expect(source).toContain("rules.officer(caller)");
        expect(source).toMatch(
          /advisesAnyProject|project.advisorId === userId/,
        );
        expect(section!.access).toBe("officer");
        return;
      }
      const delegated = LOADER_GATES[path];
      const gateSource = delegated ? loaderSource(...delegated) : source;
      if (delegated) expect(source).toContain(delegated[1]);
      const gates = [
        ...gateSource.matchAll(/requireAccess\(rules\.(\w+)\)/g),
      ].map((match) => match[1]);
      expect(gates).toEqual([expected]);
    },
  );
  it("keeps every exception tied to a real sub-page", () => {
    const paths = pages(CONSOLE).map(
      (file) =>
        "/console/" + relative(CONSOLE, file).replace(/\/page\.tsx$/, ""),
    );
    for (const [path, access] of Object.entries(EXCEPTIONS)) {
      expect(paths).toContain(path);
      expect(path).not.toBe(sectionFor(path)?.href);
      // The attendance exception is provably stricter for every possible caller.
      if (path.includes("attendance"))
        for (const caller of callers) {
          if (rules[access](caller))
            expect(rules.useGraphics(caller)).toBe(true);
        }
    }
  });
});
