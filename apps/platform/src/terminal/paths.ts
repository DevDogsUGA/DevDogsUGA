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
  { pattern: "/", regex: /^\/$/, page: "(site)/page.tsx" },

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
    pattern: "/account/deletion",
    regex: /^\/account\/deletion\/?$/,
    page: "(site)/account/deletion/page.tsx",
  },

  {
    pattern: "/console/graphics",
    regex: /^\/console\/graphics\/?$/,
    page: "(site)/console/graphics/page.tsx",
  },
  {
    pattern: "/console/attendance/:meetingId/graphics",
    regex: new RegExp(`^/console/attendance/(?<meetingId>${SLUG})/graphics/?$`),
    page: "(site)/console/attendance/[meetingId]/graphics/page.tsx",
  },

  { pattern: "/help", regex: /^\/help\/?$/, page: null },
  {
    pattern: "/help/:threadId",
    regex: /^\/help\/(?<threadId>\d+)\/?$/,
    page: "(site)/help/[threadId]/page.tsx",
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
