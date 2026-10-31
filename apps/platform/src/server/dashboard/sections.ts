import "server-only";
import { DASHBOARD_SECTIONS, type DashboardSection } from "~/config/dashboard";
import { rules, type Caller } from "~/server/auth/access";

/** Resolve named rules on the server; signed-out callers see no sections. */
export function visibleSections(caller: Caller | null): DashboardSection[] {
  return DASHBOARD_SECTIONS.filter(
    (section) =>
      caller !== null &&
      (section.access === "member" || rules[section.access](caller)),
  );
}

/**
 * Longest path-prefix ownership, ignoring query strings and fragments. The
 * Overview owns only its own page: every other section sits beneath it.
 */
export function sectionFor(
  path: string | null | undefined,
): DashboardSection | null {
  if (!path) return null;
  const pathname = path.split(/[?#]/)[0]!;
  let best: DashboardSection | null = null;
  for (const section of DASHBOARD_SECTIONS) {
    if (
      (pathname === section.href ||
        (section.group !== "Overview" &&
          pathname.startsWith(`${section.href}/`))) &&
      (!best || section.href.length > best.href.length)
    )
      best = section;
  }
  return best;
}
