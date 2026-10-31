/**
 * Every site path that has a terminal twin, and the page file each one
 * mirrors.
 *
 * Twins are opt-in. Public content pages (home, events, docs, the newsletters,
 * the changelog, profiles) have one; every other page gets the generic
 * response `cloudflare/terminal.ts` builds from the page's own `<title>`, with
 * its URL and a pointer to the browser, so a new page needs no entry here.
 *
 * Kept free of imports because the Worker entry reads it: deciding whether a
 * curl request gets a twin costs a regex test, not a module graph.
 * `routes.ts` has to define a route for every pattern here (its record is
 * typed against `TerminalPattern`), and `routes.test.ts` checks that each
 * entry names a page that exists and gates like it.
 *
 * Each entry carries its own regex rather than a compiled pattern because the
 * parameter shapes differ in ways that matter: a version has dots, and an
 * event slug must NOT, or `/events/calendar.ics` (a route handler people do
 * curl) would be swallowed as a meeting called "calendar.ics". Order matters
 * too: the first match wins, so static segments sit above parameters.
 */
export interface TerminalPathEntry {
  pattern: string;
  regex: RegExp;
  /**
   * The page this path mirrors, relative to `src/app`, for the gate-parity
   * test. Null for terminal-only paths (`/help`).
   */
  page: string | null;
}

const SLUG = "[^/.]+";

export const TERMINAL_PATHS = [
  {
    pattern: "/dashboard/qr",
    regex: new RegExp("^/dashboard/qr/?$"),
    page: "(site)/dashboard/qr/page.tsx",
  },
  {
    pattern: "/dashboard/reflections",
    regex: new RegExp("^/dashboard/reflections/?$"),
    page: "(site)/dashboard/reflections/page.tsx",
  },
  {
    pattern: "/dashboard/permissions",
    regex: new RegExp("^/dashboard/permissions/?$"),
    page: "(site)/dashboard/permissions/page.tsx",
  },
  {
    pattern: "/dashboard/audit-log/:eventId",
    regex: new RegExp("^/dashboard/audit-log/(?<eventId>[^/.]+)/?$"),
    page: "(site)/dashboard/audit-log/[eventId]/page.tsx",
  },
  {
    pattern: "/dashboard/audit-log",
    regex: new RegExp("^/dashboard/audit-log/?$"),
    page: "(site)/dashboard/audit-log/page.tsx",
  },
  {
    pattern: "/dashboard/moderation/:reportId",
    regex: new RegExp("^/dashboard/moderation/(?<reportId>[^/.]+)/?$"),
    page: "(site)/dashboard/moderation/[reportId]/page.tsx",
  },
  {
    pattern: "/dashboard/moderation/users/:userId",
    regex: new RegExp("^/dashboard/moderation/users/(?<userId>[^/.]+)/?$"),
    page: "(site)/dashboard/moderation/users/[userId]/page.tsx",
  },
  {
    pattern: "/dashboard/moderation",
    regex: new RegExp("^/dashboard/moderation/?$"),
    page: "(site)/dashboard/moderation/page.tsx",
  },
  {
    pattern: "/dashboard/meetings",
    regex: new RegExp("^/dashboard/meetings/?$"),
    page: "(site)/dashboard/meetings/page.tsx",
  },
  {
    pattern: "/dashboard/docs-preview/:slug/*",
    regex: new RegExp("^/dashboard/docs-preview/(?<slug>[^/.]+)/.+/?$"),
    page: "(site)/dashboard/docs-preview/[slug]/[...path]/page.tsx",
  },
  {
    pattern: "/dashboard/docs-preview/:slug",
    regex: new RegExp("^/dashboard/docs-preview/(?<slug>[^/.]+)/?$"),
    page: "(site)/dashboard/docs-preview/[slug]/page.tsx",
  },
  {
    pattern: "/dashboard/docs-preview",
    regex: new RegExp("^/dashboard/docs-preview/?$"),
    page: "(site)/dashboard/docs-preview/page.tsx",
  },
  {
    pattern: "/dashboard/hackathons",
    regex: new RegExp("^/dashboard/hackathons/?$"),
    page: "(site)/dashboard/hackathons/page.tsx",
  },
  {
    pattern: "/dashboard/attendance",
    regex: new RegExp("^/dashboard/attendance/?$"),
    page: "(site)/dashboard/attendance/page.tsx",
  },
  {
    pattern: "/dashboard/oauth/new",
    regex: new RegExp("^/dashboard/oauth/new/?$"),
    page: "(site)/dashboard/oauth/new/page.tsx",
  },
  {
    pattern: "/dashboard/oauth/:clientId",
    regex: new RegExp("^/dashboard/oauth/(?<clientId>[^/.]+)/?$"),
    page: "(site)/dashboard/oauth/[clientId]/page.tsx",
  },
  {
    pattern: "/dashboard/oauth",
    regex: new RegExp("^/dashboard/oauth/?$"),
    page: "(site)/dashboard/oauth/page.tsx",
  },
  {
    pattern: "/dashboard/accounts",
    regex: new RegExp("^/dashboard/accounts/?$"),
    page: "(site)/dashboard/accounts/page.tsx",
  },
  {
    pattern: "/dashboard/profile",
    regex: new RegExp("^/dashboard/profile/?$"),
    page: "(site)/dashboard/profile/page.tsx",
  },
  { pattern: "/", regex: /^\/$/, page: "(site)/page.tsx" },

  {
    pattern: "/auth/failed",
    regex: /^\/auth\/failed\/?$/,
    page: "(auth)/auth/failed/page.tsx",
  },

  {
    pattern: "/oauth/connect",
    regex: /^\/oauth\/connect\/?$/,
    page: "(auth)/oauth/connect/page.tsx",
  },
  {
    pattern: "/oauth/device",
    regex: /^\/oauth\/device\/?$/,
    page: "(auth)/oauth/device/page.tsx",
  },
  {
    pattern: "/changelog",
    regex: /^\/changelog\/?$/,
    page: "(site)/changelog/page.tsx",
  },
  {
    pattern: "/changelog/:version",
    regex: /^\/changelog\/v?(?<version>\d+\.\d+\.\d+)\/?$/,
    page: "(site)/changelog/[version]/page.tsx",
  },
  {
    pattern: "/newsletters/gdgc",
    regex: /^\/newsletters\/gdgc\/?$/,
    page: "(site)/newsletters/gdgc/page.tsx",
  },
  {
    pattern: "/newsletters/gdgc/:version",
    // GDGC issues are numbered (`1`), but any dotted number matches and an
    // unknown one is the route's own 404, as on /changelog.
    regex: /^\/newsletters\/gdgc\/(?<version>\d+(?:\.\d+)*)\/?$/,
    page: "(site)/newsletters/gdgc/[version]/page.tsx",
  },

  {
    pattern: "/events",
    regex: /^\/events\/?$/,
    page: "(site)/events/page.tsx",
  },
  {
    pattern: "/events/directions",
    regex: /^\/events\/directions\/?$/,
    page: "(site)/events/directions/page.tsx",
  },
  {
    pattern: "/events/:slug",
    regex: new RegExp(`^/events/(?<slug>${SLUG})/?$`),
    page: "(site)/events/[slug]/page.tsx",
  },

  {
    pattern: "/community",
    regex: /^\/community\/?$/,
    page: "(site)/community/page.tsx",
  },
  {
    pattern: "/community/:handle",
    regex: /^\/community\/(?<handle>(?:@|%40)[^/]+)\/?$/,
    page: "(site)/community/[handle]/page.tsx",
  },

  { pattern: "/docs", regex: /^\/docs\/?$/, page: "(site)/docs/page.tsx" },
  {
    pattern: "/docs/:project",
    regex: new RegExp(`^/docs/(?<project>${SLUG})/?$`),
    page: "(site)/docs/[project]/page.tsx",
  },
  {
    pattern: "/docs/:project/*",
    regex: new RegExp(`^/docs/(?<project>${SLUG})/.+$`),
    page: "(site)/docs/[project]/[...slug]/page.tsx",
  },

  {
    pattern: "/preview/kit",
    regex: /^\/preview\/kit\/?$/,
    page: "(site)/preview/kit/page.tsx",
  },

  {
    pattern: "/dashboard/deletion",
    regex: /^\/dashboard\/deletion\/?$/,
    page: "(site)/dashboard/deletion/page.tsx",
  },

  {
    pattern: "/dashboard/meetings/:meetingId",
    regex: new RegExp(`^/dashboard/meetings/(?<meetingId>${SLUG})/?$`),
    page: "(site)/dashboard/meetings/[meetingId]/page.tsx",
  },
  {
    pattern: "/dashboard/apps",
    regex: /^\/dashboard\/apps\/?$/,
    page: "(site)/dashboard/apps/page.tsx",
  },
  {
    pattern: "/dashboard/graphics",
    regex: /^\/dashboard\/graphics\/?$/,
    page: "(site)/dashboard/graphics/page.tsx",
  },
  {
    pattern: "/dashboard/meetings/:meetingId/graphics",
    regex: new RegExp(`^/dashboard/meetings/(?<meetingId>${SLUG})/graphics/?$`),
    page: "(site)/dashboard/meetings/[meetingId]/graphics/page.tsx",
  },

  {
    pattern: "/dashboard/data",
    regex: /^\/dashboard\/data\/?$/,
    page: "(site)/dashboard/data/page.tsx",
  },
  {
    pattern: "/dashboard/data/exports",
    regex: /^\/dashboard\/data\/exports\/?$/,
    page: "(site)/dashboard/data/exports/page.tsx",
  },
  {
    pattern: "/dashboard/data/imports",
    regex: /^\/dashboard\/data\/imports\/?$/,
    page: "(site)/dashboard/data/imports/page.tsx",
  },

  {
    pattern: "/dashboard/schedule",
    regex: /^\/dashboard\/schedule\/?$/,
    page: "(site)/dashboard/schedule/page.tsx",
  },
  {
    pattern: "/dashboard/schedule/:collection/:key",
    regex: new RegExp(
      `^/dashboard/schedule/(?<collection>${SLUG})/(?<key>${SLUG})/?$`,
    ),
    page: "(site)/dashboard/schedule/[collection]/[key]/page.tsx",
  },

  {
    pattern: "/dashboard/badges",
    regex: /^\/dashboard\/badges\/?$/,
    page: "(site)/dashboard/badges/page.tsx",
  },
  {
    pattern: "/dashboard/badges/:userId",
    regex: new RegExp(`^/dashboard/badges/(?<userId>${SLUG})/?$`),
    page: "(site)/dashboard/badges/[userId]/page.tsx",
  },

  {
    pattern: "/dashboard/reviews",
    regex: /^\/dashboard\/reviews\/?$/,
    page: "(site)/dashboard/reviews/page.tsx",
  },

  {
    pattern: "/dashboard/projects",
    regex: /^\/dashboard\/projects\/?$/,
    page: "(site)/dashboard/projects/page.tsx",
  },
  {
    pattern: "/dashboard/projects/:idOrSlug",
    regex: new RegExp(`^/dashboard/projects/(?<idOrSlug>${SLUG})/?$`),
    page: "(site)/dashboard/projects/[idOrSlug]/page.tsx",
  },
  {
    pattern: "/dashboard/projects/:idOrSlug/report",
    regex: new RegExp(`^/dashboard/projects/(?<idOrSlug>${SLUG})/report/?$`),
    page: "(site)/dashboard/projects/[idOrSlug]/report/page.tsx",
  },

  { pattern: "/help", regex: /^\/help\/?$/, page: null },
  {
    pattern: "/help/:threadId",
    regex: /^\/help\/(?<threadId>\d+)\/?$/,
    page: "(site)/help/[threadId]/page.tsx",
  },
  {
    pattern: "/dashboard",
    regex: /^\/dashboard\/?$/,
    page: "(site)/dashboard/page.tsx",
  },
  {
    pattern: "/dashboard/meetings/:meetingId/present",
    regex: /^\/dashboard\/meetings\/(?<meetingId>[^/.]+)\/present\/?$/,
    page: "(present)/dashboard/meetings/[meetingId]/present/page.tsx",
  },
  {
    pattern: "/dashboard/*",
    regex:
      /^\/dashboard\/(?!data\/(?:imports\/(?:preview|confirm)|exports\/prepare)(?:\/|$)|graphics\/(?:brand|meetings)(?:\/|$)).+$/,
    page: "(site)/dashboard/[...slug]/page.tsx",
  },
] as const satisfies readonly TerminalPathEntry[];

export type TerminalPattern = (typeof TERMINAL_PATHS)[number]["pattern"];

export interface TerminalMatch {
  pattern: TerminalPattern;
  params: Record<string, string>;
}

export function matchTerminalPath(pathname: string): TerminalMatch | null {
  for (const entry of TERMINAL_PATHS) {
    const match = entry.regex.exec(pathname);
    if (match) {
      return { pattern: entry.pattern, params: { ...match.groups } };
    }
  }
  return null;
}

/** Where the Worker entry forwards a terminal request inside the app. */
export const TERMINAL_PREFIX = "/terminal";

export type TerminalFormat = "ansi" | "plain";

/**
 * Whether a request wants the terminal, and in which form.
 *
 * `?format=` decides when present, so the text is reachable from anywhere
 * (`?format=txt` from a browser, `?format=ansi` from a curl that spoofs its
 * user agent). Otherwise only command-line HTTP clients qualify, and only when
 * they haven't asked for HTML: `curl -H 'Accept: text/html'` still gets the
 * page. Text browsers (lynx, w3m) are left out on purpose; they render HTML.
 */
export function terminalFormat(request: Request): TerminalFormat | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const format = new URL(request.url).searchParams.get("format");
  if (format === "ansi") return "ansi";
  if (format === "txt" || format === "text" || format === "plain")
    return "plain";
  const agent = request.headers.get("user-agent") ?? "";
  if (!/^(?:curl|wget|httpie|xh)\//i.test(agent)) return null;
  if ((request.headers.get("accept") ?? "").includes("text/html")) return null;
  return "ansi";
}
