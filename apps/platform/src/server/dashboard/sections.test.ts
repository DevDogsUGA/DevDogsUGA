import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("~/server/auth", () => ({ expectSession: vi.fn() }));
vi.mock("~/server/auth/permissions", () => ({ getCallerContext: vi.fn() }));
import { DASHBOARD_SECTIONS } from "~/config/dashboard";
import { rules, type Caller } from "~/server/auth/access";
import { matchTerminalPath, TERMINAL_PATHS } from "~/terminal/paths";
import { buildAppSearchEntries } from "~/server/search/appEntries";
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
  it("search indexes exactly the visible registry pages, with no retired URLs", () => {
    for (const caller of [null, ...callers]) {
      const entries = buildAppSearchEntries(caller);
      const dashboardPages = entries.filter(
        (entry) =>
          entry.url.startsWith("/dashboard") && entry.id.startsWith("page:"),
      );
      expect(dashboardPages.map((entry) => entry.url)).toEqual(
        visibleSections(caller).map((section) => section.href),
      );
      for (const entry of entries)
        expect(entry.url).not.toMatch(
          /^\/(?:settings|console|tools\/oauth)(?:\/|$)/,
        );
    }
  });
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
  it.each(DASHBOARD_SECTIONS.filter((section) => section.group !== "Overview"))(
    "owns $href and its descendants",
    (section) => {
      expect(sectionFor(section.href)).toBe(section);
      expect(sectionFor(`${section.href}/child?x=1#anchor`)).toBe(section);
      expect(sectionFor(`${section.href}-unknown`)).not.toBe(section);
    },
  );
  it("gives the Overview only its own page, since every section sits beneath it", () => {
    const overview = DASHBOARD_SECTIONS.find((s) => s.id === "overview");
    expect(overview?.href).toBe("/dashboard");
    expect(sectionFor("/dashboard")).toBe(overview);
    expect(sectionFor("/dashboard?tab=1#top")).toBe(overview);
    expect(sectionFor("/dashboard/unknown")).toBeNull();
    expect(sectionFor("/dashboard/deletion")).toBeNull();
  });
  it("lights up OAuth apps on a client's own page", () => {
    expect(
      sectionFor("/dashboard/oauth/11111111-1111-4111-8111-111111111111")?.id,
    ).toBe("oauth");
  });
  it("rejects unowned paths", () => {
    expect(sectionFor(null)).toBeNull();
    expect(sectionFor("/dashboard/unknown")).toBeNull();
  });
  it("shows the Overview to every signed-in caller", () => {
    for (const caller of callers)
      expect(visibleSections(caller).map((s) => s.id)).toContain("overview");
  });
  it("lists Hackathons for every signed-in member, in the Projects group", () => {
    const section = DASHBOARD_SECTIONS.find((s) => s.id === "hackathons");
    expect(section).toMatchObject({
      href: "/dashboard/hackathons",
      group: "Projects",
      access: "member",
      refusal: "forbidden",
    });
    for (const caller of callers)
      expect(visibleSections(caller)).toContain(section);
    expect(visibleSections(null)).not.toContain(section);
    expect(sectionFor("/dashboard/hackathons#submit")).toBe(section);
  });
  it("answers the Hackathons terminal twin with the sign-in notice, never a list", () => {
    const match = matchTerminalPath("/dashboard/hackathons");
    expect(match).not.toBeNull();
    expect(
      TERMINAL_PATHS.some(
        (entry) => entry.page === "(site)/dashboard/hackathons/page.tsx",
      ),
    ).toBe(true);
  });
  it.each(DASHBOARD_SECTIONS)("has a terminal twin for $href", (section) =>
    expect(matchTerminalPath(section.href)).not.toBeNull(),
  );
});

const SRC = resolve(process.cwd(), "src");
const DASHBOARD = resolve(SRC, "app/(site)/dashboard");
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
  "/dashboard/meetings/[meetingId]": "manageAttendance",
  // Different rule, not stricter: manageSuspensions is its own capability; a suspensions manager reaches this page by direct link or from a report.
  "/dashboard/moderation/users/[userId]": "manageSuspensions",
};

/** These pages delegate their primary gate to a loader; auxiliary grants are not page gates. */
const LOADER_GATES: Record<string, [string, string]> = {
  "/dashboard/permissions": [
    "server/loaders/permissions.ts",
    "getPermissionsPageData",
  ],
  "/dashboard/moderation": [
    "server/loaders/moderation.ts",
    "getModerationPageData",
  ],
  "/dashboard/moderation/[reportId]": [
    "server/loaders/moderation.ts",
    "getReportDetailData",
  ],
  "/dashboard/moderation/users/[userId]": [
    "server/loaders/moderation.ts",
    "getUserModerationData",
  ],
  "/dashboard/audit-log/[eventId]": [
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

describe("dashboard page access drift", () => {
  it.each(pages(DASHBOARD))("has a terminal twin for %s", (file) => {
    expect(
      TERMINAL_PATHS.some(
        (entry) => entry.page === relative(resolve(SRC, "app"), file),
      ),
    ).toBe(true);
  });
  it.each(pages(DASHBOARD))(
    "matches its section or an explicit sub-page exception: %s",
    (file) => {
      const suffix = relative(DASHBOARD, file).replace(
        /(?:^|\/)page\.tsx$/,
        "",
      );
      const path = suffix ? `/dashboard/${suffix}` : "/dashboard";
      const section = sectionFor(path);
      // Pending deletion is deliberately absent from navigation; the layout gates it.
      if (path === "/dashboard/[...slug]") {
        expect(readFileSync(file, "utf8")).toContain(
          "await requireDashboard()",
        );
        expect(readFileSync(file, "utf8")).toContain("notFound()");
        return;
      }
      if (path !== "/dashboard/deletion") expect(section, path).not.toBeNull();
      const source = readFileSync(file, "utf8");
      const expected = EXCEPTIONS[path] ?? section?.access ?? "member";
      if (path.startsWith("/dashboard/docs-preview")) {
        // Signed in for everything under it (the layout), then per page: the
        // landing page is for docs reviewers alone, and a project's pages go
        // through the project gate (owners, contributors and reviewers).
        const layout = readFileSync(
          resolve(DASHBOARD, "docs-preview/layout.tsx"),
          "utf8",
        );
        expect(layout).toContain("await requireDashboard()");
        const gate = readFileSync(
          resolve(SRC, "server/docs/previewAccess.ts"),
          "utf8",
        );
        expect(gate).toContain("await requireDashboard()");
        expect(gate).toContain("notFound()");
        if (path === "/dashboard/docs-preview") {
          expect(source).toContain("await requireDocsPreview()");
          expect(gate).toContain("!rules.previewDocs(caller)");
        } else {
          const projectLayout = readFileSync(
            resolve(DASHBOARD, "docs-preview/[slug]/layout.tsx"),
            "utf8",
          );
          const route = readFileSync(
            resolve(SRC, "components/DocsPreviewRoute.tsx"),
            "utf8",
          );
          expect(projectLayout).toContain("PreviewLayout");
          expect(route).toContain("await requirePreviewProject(slug)");
          expect(gate).toContain("mayPreviewDocs(project.facts)");
        }
        return;
      }
      if (expected === "member") {
        const layout = readFileSync(resolve(DASHBOARD, "layout.tsx"), "utf8");
        expect(layout).toContain("await requireDashboard()");
        // Member pages may check auxiliary grants, but must not impose a page rule.
        expect(source).not.toMatch(/requireAccess\(rules\./);
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
  it("gates the review queue on reviewProjectReports alone: officers without it are refused, and advisors review from the project page", () => {
    const reviews = DASHBOARD_SECTIONS.find((s) => s.id === "reviews")!;
    expect(reviews.access).toBe("reviewProjectReports");
    for (const caller of callers) {
      expect(visibleSections(caller).includes(reviews)).toBe(
        caller.flags.canReviewProjectReports,
      );
    }
    // The project page serves the advisor through its record rule, not this section.
    const project = readFileSync(
      resolve(DASHBOARD, "projects/[idOrSlug]/page.tsx"),
      "utf8",
    );
    expect(project).toContain("relation.isAdvisor");
    expect(project).toContain("rules.reviewProjectReports(caller)");
  });
  it("keeps every exception tied to a real sub-page", () => {
    const paths = pages(DASHBOARD).map(
      (file) =>
        "/dashboard/" + relative(DASHBOARD, file).replace(/\/page\.tsx$/, ""),
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
