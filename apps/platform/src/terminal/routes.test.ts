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
 * The rules that keep the terminal honest as the site grows:
 *
 * 1. Every terminal path that mirrors a page names a page that exists, so a
 *    renamed or deleted page can't leave a twin pointing at nothing.
 * 2. Gate parity. A terminal route mirrors its page's feature gate: the same
 *    predicate, off the same way. A page that 404s in production can't leak
 *    through its terminal twin.
 *
 * Dashboard and auth pages must have twins. Other pages are opt-in and
 * otherwise get the generic response (`cloudflare/terminal.ts`).
 */

const APP = join(__dirname, "../app");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [relative(APP, full)] : [];
  });
}

describe("terminal paths", () => {
  const files = pages(APP);

  it("names only page files that exist", () => {
    for (const entry of TERMINAL_PATHS) {
      if (entry.page !== null) expect(files).toContain(entry.page);
    }
  });

  it("covers every dashboard and auth page", () => {
    const mirrored = new Set(TERMINAL_PATHS.map((entry) => entry.page));
    for (const file of files.filter(
      (file) =>
        file.startsWith("(site)/dashboard/") || file.startsWith("(auth)/"),
    ))
      expect(mirrored, file).toContain(file);
  });

  it("leaves other pages without a twin", () => {
    expect(matchTerminalPath("/account")).toBeNull();
    expect(matchTerminalPath("/legal/privacy")).toBeNull();
    expect(matchTerminalPath("/partners")).toBeNull();
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
    `if \\(!${gate}\\(\\)\\)\\s*(?:return\\s*)?(redirect\\(|notFound\\()`,
  ).exec(source);
  if (!branch) return null;
  return branch[1] === "redirect(" ? "redirect" : "notFound";
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

      // A predicate may toggle a card inside a page (profile settings), rather
      // than gate the whole page. Only denial branches belong to route parity.
      const pageGates = featureGates(source).filter(
        (gate) => offBehaviour(source, gate) !== null,
      );
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
