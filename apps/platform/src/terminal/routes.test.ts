// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { TerminalRoute } from "./define";
import { matchTerminalPath, TERMINAL_PATHS } from "./paths";
import { TERMINAL_ROUTES } from "./routes";

// The route modules import the loaders, and through them the database client,
// whose package guards itself with `server-only`. Nothing here queries it.
vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { BASE_URL: "http://localhost:3000" } }));

/**
 * The two rules that keep the terminal honest as the site grows:
 *
 * 1. Coverage. Every page in the app resolves to a terminal path, so shipping
 *    a page forces a decision about what curl sees (a terminal route, or a
 *    browser-only notice), instead of curl silently getting HTML.
 * 2. Gate parity. A terminal route mirrors its page's feature gate: the same
 *    predicate, off the same way. A page that 404s in production can't leak
 *    through its terminal twin.
 */

const APP = join(__dirname, "../app");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [relative(APP, full)] : [];
  });
}

const SAMPLE: Record<string, string> = {
  version: "1.2.3",
  handle: "@sample",
  threadId: "123456789012345678",
};

/** A concrete URL a page file serves, for matching against the path table. */
function samplePath(page: string): string {
  const segments = page
    .split("/")
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => {
      const optional = /^\[\[\.\.\.(\w+)\]\]$/.exec(segment);
      if (optional) return "";
      const rest = /^\[\.\.\.(\w+)\]$/.exec(segment);
      if (rest) return "a/b";
      const param = /^\[(\w+)\]$/.exec(segment);
      if (param) return SAMPLE[param[1]!] ?? "sample";
      return segment;
    })
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

describe("terminal coverage", () => {
  const files = pages(APP);

  it.each(files)("%s has a terminal path", (page) => {
    const match = matchTerminalPath(samplePath(page));
    expect(match, `add ${samplePath(page)} to TERMINAL_PATHS`).not.toBeNull();
    const entry = TERMINAL_PATHS.find((e) => e.pattern === match!.pattern)!;
    if (entry.page !== null) expect(entry.page).toBe(page);
  });

  it("names only page files that exist", () => {
    for (const entry of TERMINAL_PATHS) {
      if (entry.page !== null) expect(files).toContain(entry.page);
    }
  });
});

/** The names a page imports from `~/server/features`. */
function featureGates(source: string): string[] {
  const block = /import\s*\{([^}]*)\}\s*from\s*"~\/server\/features"/.exec(
    source,
  );
  if (!block) return [];
  return block[1]!
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/** What the page does when `gate()` is false, read off its `if (!gate())`. */
function offBehaviour(source: string, gate: string): string | null {
  const branch = new RegExp(
    `if \\(!${gate}\\(\\)\\)\\s*(?:return\\s*)?(<UnderConstruction|redirect\\(|notFound\\()`,
  ).exec(source);
  if (!branch) return null;
  return branch[1] === "<UnderConstruction"
    ? "underConstruction"
    : branch[1] === "redirect("
      ? "redirect"
      : "notFound";
}

describe("terminal gate parity", () => {
  const mirrored = TERMINAL_PATHS.filter((entry) => entry.page !== null);

  it.each(mirrored.map((entry) => [entry.pattern, entry.page] as const))(
    "%s gates like %s",
    (pattern, page) => {
      const source = readFileSync(join(APP, page), "utf8");
      expect(
        source,
        "check the environment through a ~/server/features predicate, not inline, so the terminal can share it",
      ).not.toMatch(/process\.env\.DEPLOY_ENV/);

      const route: TerminalRoute = TERMINAL_ROUTES[pattern];
      if (route.kind === "browser") return;

      const pageGates = featureGates(source);
      const routeGates =
        route.gate.kind === "feature" ? [route.gate.enabled.name] : [];
      expect(routeGates).toEqual(pageGates);

      if (route.gate.kind === "feature") {
        expect(route.gate.whenOff.kind).toBe(
          offBehaviour(source, route.gate.enabled.name),
        );
      }
    },
  );
});
