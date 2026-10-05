/**
 * Every site path the terminal answers for, and the page file each one
 * mirrors.
 *
 * Kept free of imports because the Worker entry reads it: deciding whether a
 * curl request gets the terminal costs a regex test, not a module graph.
 * `routes.ts` has to define a route for every pattern here (its record is
 * typed against `TerminalPattern`), and `routes.test.ts` checks the other
 * direction: every `page.tsx` in the app resolves to some entry, so a new page
 * can't ship without a decision about what curl sees.
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
   * test. Null for terminal-only paths (`/help`) and for wildcards that
   * stand in for a whole subtree of browser-only pages.
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
    pattern: "/competitions/:slug",
    regex: new RegExp(`^/competitions/(?<slug>${SLUG})/?$`),
    page: "(site)/competitions/[slug]/page.tsx",
  },
  {
    pattern: "/competitions/:slug/results",
    regex: new RegExp(`^/competitions/(?<slug>${SLUG})/results/?$`),
    page: "(site)/competitions/[slug]/results/page.tsx",
  },

  {
    pattern: "/community",
    regex: /^\/community\/?$/,
    page: "(site)/community/page.tsx",
  },
  {
    pattern: "/community/competitions",
    regex: /^\/community\/competitions\/?$/,
    page: "(site)/community/competitions/page.tsx",
  },
  {
    pattern: "/community/:handle",
    regex: /^\/community\/(?<handle>(?:@|%40)[^/]+)\/?$/,
    page: "(site)/community/[handle]/page.tsx",
  },

  {
    pattern: "/partners",
    regex: /^\/partners\/?$/,
    page: "(site)/partners/page.tsx",
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

  { pattern: "/help", regex: /^\/help\/?$/, page: null },
  {
    pattern: "/help/:threadId",
    regex: /^\/help\/(?<threadId>\d+)\/?$/,
    page: "(site)/help/[threadId]/page.tsx",
  },

  // Pages a terminal can't stand in for. Each gets a notice pointing at the
  // browser rather than a screenful of HTML.
  {
    pattern: "/legal/privacy",
    regex: /^\/legal\/privacy\/?$/,
    page: "(site)/legal/privacy/page.tsx",
  },
  {
    pattern: "/account",
    regex: /^\/account\/?$/,
    page: "(site)/account/page.tsx",
  },
  {
    pattern: "/attendance",
    regex: /^\/attendance\/?$/,
    page: "(site)/attendance/page.tsx",
  },
  { pattern: "/teams", regex: /^\/teams\/?$/, page: "(site)/teams/page.tsx" },
  {
    pattern: "/teams/requests",
    regex: /^\/teams\/requests\/?$/,
    page: "(site)/teams/requests/page.tsx",
  },
  {
    pattern: "/teams/:team",
    regex: new RegExp(`^/teams/(?<team>${SLUG})/?$`),
    page: "(site)/teams/[team]/page.tsx",
  },
  { pattern: "/console/*", regex: /^\/console(?:\/[^.]*)?$/, page: null },
  // Pages only: the OAuth device and exchange endpoints under these paths
  // are route handlers the devtools CLI calls, and must pass through.
  {
    pattern: "/tools/oauth",
    regex: /^\/tools\/oauth(?:\/(?:device|connect))?\/?$/,
    page: null,
  },
  { pattern: "/preview/*", regex: /^\/preview(?:\/[^.]*)?$/, page: null },
  {
    pattern: "/oauth/consent",
    regex: /^\/oauth\/consent\/?$/,
    page: "(auth)/oauth/consent/page.tsx",
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
