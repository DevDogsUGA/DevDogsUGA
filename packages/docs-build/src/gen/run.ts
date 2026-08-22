/**
 * The generator's orchestrator: discover the targets, run every extractor over
 * them, and write the markdown out under `docs/<project>/reference/`.
 *
 * Two invariants shape the whole file. Every target gets exactly one
 * `ts.Program`, shared by all three TypeScript extractors, because building it
 * is by far the slowest thing the docs build does. And every generated page
 * lives inside a `reference/` tree that this module deletes before it writes,
 * so a renamed or deleted source file cannot leave a stale page behind for a
 * reader to trust.
 *
 * Nothing here is exported from `src/index.ts`. `@devdogsuga/docs` re-exports
 * that module's types, so anything on it widens the graph `apps/platform`
 * typechecks against; the generator is reachable as `docs-build gen` and
 * through the `./gen` subpath, and that is all.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { extractComponents } from "./components.js";
import { extractDart } from "./dart.js";
import { renderGroupPage, renderRoutesPage } from "./emit.js";
import type { EmitOptions } from "./emit.js";
import { extractFunctions } from "./functions.js";
import { emptyResult, mergeResults } from "./model.js";
import type {
  CoverageRow,
  DocGroup,
  ExtractResult,
  RouteEntry,
} from "./model.js";
import { createProgram, discoverTargets } from "./program.js";
import type { Target, TargetContext } from "./program.js";
import { extractRoutes } from "./routes.js";

/** Where "view source" points when nothing overrides it. */
const DEFAULT_SOURCE_BASE_URL =
  "https://github.com/DevDogsUGA/DevDogsUGA/blob/main";

/** The Flutter app. It has no `src/`, so `discoverTargets` never sees it. */
const DART_APP_DIR = "apps/study-group-finder";
const DART_DOCS_PROJECT = "study-group-finder";

/** The one path segment a generated page is allowed to live under. */
const REFERENCE_SEGMENT = "reference";

/** Package machinery that sits alongside the content and is never a project. */
const NOT_A_PROJECT = new Set(["dist", "node_modules", ".turbo"]);

/**
 * The route pages come after a project's written index but before its symbol
 * groups, which start at 10.
 */
const ROUTES_ORDER = 2;
const API_ROUTES_ORDER = 3;

export interface GenOptions {
  /** Absolute path to the monorepo root — the directory holding `docs/`. */
  repoRoot: string;
  /** Absolute path to the content root, normally `<repoRoot>/docs`. */
  docsRoot: string;
  /** Render and report, touching nothing on disk. */
  dryRun?: boolean;
  /** Overrides `DOCS_SOURCE_BASE_URL`, which overrides the default. */
  sourceBaseUrl?: string;
}

/**
 * What a run produced. Coverage is on here because it is *reported* — it is
 * printed on every run and never gates anything, so a caller that wants to act
 * on it has to decide to.
 */
export interface GenSummary {
  /** Pages written, or that would be written under `dryRun`. */
  pages: number;
  symbols: number;
  routes: number;
  /** One row per area, summed across targets that contribute to it. */
  coverage: CoverageRow[];
  warnings: string[];
  /** The written pages, relative to `docsRoot`, in write order. */
  files: string[];
  dryRun: boolean;
}

/** A rendered page, held until every extractor has finished. */
interface PendingPage {
  /** Path under `docsRoot`, no extension. */
  docsPath: string;
  markdown: string;
  /** Counted for the summary, so the number reported is the number written. */
  symbols: number;
}

/** One extractor's output, tagged with the `docs/` project it belongs to. */
interface ProjectResult {
  docsProject: string;
  result: ExtractResult;
}

/**
 * Generates the whole reference and prints a summary. Returns rather than
 * exiting: coverage is reported and never enforced, so nothing in here has any
 * business deciding an exit code.
 */
export function generateReference(options: GenOptions): GenSummary {
  const repoRoot = trimSlash(toPosix(options.repoRoot));
  const docsRoot = trimSlash(toPosix(options.docsRoot));
  const dryRun = options.dryRun ?? false;
  const emit: EmitOptions = {
    sourceBaseUrl: resolveSourceBaseUrl(options.sourceBaseUrl),
  };

  const collected: ProjectResult[] = [];

  for (const target of discoverTargets(repoRoot)) {
    collected.push({
      docsProject: target.docsProject,
      result: extractTarget(repoRoot, target),
    });
  }

  collected.push({
    docsProject: DART_DOCS_PROJECT,
    result: extractDartApp(repoRoot),
  });

  const merged = mergeResults(...collected.map((entry) => entry.result));
  const warnings = [...merged.warnings];

  const pages: PendingPage[] = merged.groups.map((group) => ({
    docsPath: group.path,
    markdown: renderGroupPage(group, emit),
    symbols: group.symbols.length,
  }));

  pages.push(...routePages(collected, emit));

  // Extraction is finished and every page is rendered before anything on disk
  // is touched, so an extractor that throws leaves the previous reference in
  // place instead of half-deleting it.
  const accepted = acceptPages(pages, docsRoot, warnings);

  if (!dryRun) {
    removeReferenceTrees(docsRoot);
    for (const page of accepted) {
      const file = path.join(docsRoot, `${page.docsPath}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, page.markdown, "utf-8");
    }
  }

  const summary: GenSummary = {
    pages: accepted.length,
    symbols: accepted.reduce((sum, page) => sum + page.symbols, 0),
    routes: merged.routes.length,
    coverage: aggregateCoverage(merged.coverage, merged.groups),
    warnings,
    files: accepted.map((page) => `${page.docsPath}.md`),
    dryRun,
  };

  printSummary(summary, docsRoot);
  return summary;
}

/* Extraction ------------------------------------------------------------- */

/**
 * One target, one program. The three TypeScript extractors all ask the same
 * checker: a second `ts.Program` over the same files would double the slowest
 * part of the docs build for nothing.
 *
 * A target that throws costs its own pages and warns; it does not take the
 * other twelve down with it. This generator is warn-only.
 */
function extractTarget(repoRoot: string, target: Target): ExtractResult {
  try {
    const program = createProgram(target);
    const context: TargetContext = {
      repoRoot,
      target,
      program,
      checker: program.getTypeChecker(),
    };

    return mergeResults(
      extractComponents(context),
      extractFunctions(context),
      target.hasAppRouter ? extractRoutes(context) : emptyResult(),
    );
  } catch (error) {
    return failed(`${target.dir}: ${describe(error)}`);
  }
}

/** The Dart pass, which reads a JSON artifact rather than a `ts.Program`. */
function extractDartApp(repoRoot: string): ExtractResult {
  const appDir = `${repoRoot}/${DART_APP_DIR}`;
  if (!isDirectory(appDir)) {
    return failed(`${DART_APP_DIR} is missing — skipping the Dart pass`);
  }

  try {
    return extractDart(repoRoot, appDir);
  } catch (error) {
    return failed(`${DART_APP_DIR}: ${describe(error)}`);
  }
}

/** An otherwise-empty result carrying one warning. */
function failed(message: string): ExtractResult {
  return { ...emptyResult(), warnings: [message] };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* Routes ----------------------------------------------------------------- */

/**
 * Two pages per project, split on `isApi`. A page URL and a route handler are
 * different things to a reader — one is somewhere to navigate, the other is an
 * HTTP entry point — and the columns that describe them differ too.
 *
 * Routes are bucketed by `docs/` project rather than by target because several
 * packages share the `toolkit` project, and two targets writing the same page
 * path would silently mean one of them losing.
 */
function routePages(
  collected: ProjectResult[],
  emit: EmitOptions,
): PendingPage[] {
  const byProject = new Map<string, RouteEntry[]>();

  for (const { docsProject, result } of collected) {
    if (result.routes.length === 0) continue;
    const bucket = byProject.get(docsProject);
    if (bucket === undefined) byProject.set(docsProject, [...result.routes]);
    else bucket.push(...result.routes);
  }

  const pages: PendingPage[] = [];

  for (const project of [...byProject.keys()].sort(compareStrings)) {
    const routes = byProject.get(project) ?? [];
    const navigable = routes
      .filter((route) => !route.isApi)
      .sort((a, b) => compareStrings(a.url, b.url));
    const handlers = routes
      .filter((route) => route.isApi)
      .sort((a, b) => compareStrings(a.url, b.url));

    // An app with no `route.ts` should not get an empty API page, and a docs
    // project that is all handlers should not get an empty routes page.
    if (navigable.length > 0) {
      pages.push({
        docsPath: `${project}/${REFERENCE_SEGMENT}/routes`,
        markdown: renderRoutesPage(
          navigable,
          {
            title: "Routes",
            description:
              "Every URL this app serves and the file that renders it, enumerated from the App Router directory tree.",
            order: ROUTES_ORDER,
            isApi: false,
          },
          emit,
        ),
        symbols: 0,
      });
    }

    if (handlers.length > 0) {
      pages.push({
        docsPath: `${project}/${REFERENCE_SEGMENT}/api-routes`,
        markdown: renderRoutesPage(
          handlers,
          {
            title: "API Routes",
            description:
              "Every route handler and the HTTP methods it exports. Each one is reachable over the network, so this table is a security surface as much as a reference.",
            order: API_ROUTES_ORDER,
            isApi: true,
          },
          emit,
        ),
        symbols: 0,
      });
    }
  }

  return pages;
}

/* Output ----------------------------------------------------------------- */

/**
 * The pages that are safe to write, in a stable order.
 *
 * Two rules, both of which exist because this module deletes directories. A
 * page must resolve inside `docsRoot`, and it must sit under a project's
 * `reference/` — the only tree that gets cleaned, and the only one where a
 * generated page cannot land on top of a hand-written one. Anything else warns
 * and is dropped rather than written somewhere it would outlive its source.
 */
function acceptPages(
  pages: PendingPage[],
  docsRoot: string,
  warnings: string[],
): PendingPage[] {
  const accepted = new Map<string, PendingPage>();

  for (const page of pages) {
    const segments = page.docsPath.split("/");
    if (segments.length < 3 || segments[1] !== REFERENCE_SEGMENT) {
      warnings.push(
        `refusing to write "${page.docsPath}": generated pages live under <project>/${REFERENCE_SEGMENT}/`,
      );
      continue;
    }

    if (!isInsideDocsRoot(docsRoot, page.docsPath)) {
      warnings.push(`refusing to write "${page.docsPath}": escapes docs/`);
      continue;
    }

    if (accepted.has(page.docsPath)) {
      warnings.push(
        `two extractors produced "${page.docsPath}"; keeping the first`,
      );
      continue;
    }

    accepted.set(page.docsPath, page);
  }

  return [...accepted.values()].sort((a, b) =>
    compareStrings(a.docsPath, b.docsPath),
  );
}

function isInsideDocsRoot(docsRoot: string, docsPath: string): boolean {
  const root = path.resolve(docsRoot);
  const file = path.resolve(root, `${docsPath}.md`);
  return file.startsWith(`${root}${path.sep}`);
}

/**
 * Deletes `docs/<project>/reference/` everywhere it exists, so a page whose
 * source was renamed or deleted cannot survive as an orphan nobody notices is
 * wrong.
 *
 * Deliberately narrow: only a directory named exactly `reference`, only one
 * level below a docs project, and only a real directory — a symlink is left
 * alone rather than followed out of the tree. Hand-written pages live beside
 * these trees, never inside one.
 */
function removeReferenceTrees(docsRoot: string): void {
  for (const entry of childEntries(docsRoot)) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || NOT_A_PROJECT.has(entry.name)) continue;

    const dir = `${docsRoot}/${entry.name}/${REFERENCE_SEGMENT}`;
    const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isDirectory()) continue;

    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* Summary ---------------------------------------------------------------- */

/**
 * One row per area, keyed by docs page path and summed.
 *
 * Two reasons this cannot just group by the string it was handed. Every package
 * contributes its own rows to the shared `toolkit` project, so an unaggregated
 * list would print the same area eight times and mean nothing. And the
 * extractors label a row differently — the components pass names the source
 * directories it read, the functions pass names the page it wrote — so the
 * table sorted into two interleaved conventions, and the same code could appear
 * twice under two names.
 *
 * The docs page path wins because it is the one a reader can navigate to, which
 * makes the table a contents listing with coverage attached rather than a map
 * of the tree it was derived from.
 */
function aggregateCoverage(
  rows: CoverageRow[],
  groups: DocGroup[],
): CoverageRow[] {
  const index = indexAreas(groups);
  const byArea = new Map<string, CoverageRow>();

  for (const row of rows) {
    const area = docsArea(row.area, index);
    const found = byArea.get(area);
    if (found === undefined) byArea.set(area, { ...row, area });
    else {
      found.symbols += row.symbols;
      found.documented += row.documented;
    }
  }

  return [...byArea.values()].sort((a, b) => compareStrings(a.area, b.area));
}

/**
 * What a coverage area is matched against, built from the pages this run
 * actually emitted.
 *
 * A `DocGroup` is the only thing that knows both halves of the translation: its
 * `path` is the page, and its symbols carry the source files that fed it. That
 * is why the fix lives here rather than in an extractor — neither extractor can
 * see the other's convention, and this module has already merged both.
 */
interface AreaIndex {
  /** Every emitted page path, so a row already keyed that way is left alone. */
  pages: Set<string>;
  /** Repo-relative source directory → the pages built from files in it. */
  pagesByDirectory: Map<string, Set<string>>;
}

function indexAreas(groups: DocGroup[]): AreaIndex {
  const pages = new Set<string>();
  const pagesByDirectory = new Map<string, Set<string>>();

  for (const group of groups) {
    pages.add(group.path);
    for (const symbol of group.symbols) {
      const directory = directoryOf(symbol.source.file);
      const found = pagesByDirectory.get(directory);
      if (found === undefined) {
        pagesByDirectory.set(directory, new Set([group.path]));
      } else found.add(group.path);
    }
  }

  return { pages, pagesByDirectory };
}

/**
 * A row's area as a docs page path, or the area unchanged when it cannot be
 * one.
 *
 * Nothing is dropped and nothing is guessed. A source directory that feeds two
 * pages has no single answer, and a directory this run emitted no page for has
 * none at all; in both cases the label the extractor supplied is still true,
 * where an invented page path would send a reader somewhere that does not
 * exist.
 */
function docsArea(area: string, index: AreaIndex): string {
  if (index.pages.has(area)) return area;

  // The components pass names every directory that fed one page, comma
  // separated, so the parts have to agree on a page for the row to mean it.
  const pages = new Set<string>();
  for (const part of area.split(",")) {
    const found = index.pagesByDirectory.get(part.trim());
    if (found === undefined) return area;
    for (const page of found) pages.add(page);
  }

  const only = [...pages][0];
  return only !== undefined && pages.size === 1 ? only : area;
}

function percent(documented: number, symbols: number): string {
  return symbols === 0 ? "—" : `${Math.round((documented / symbols) * 100)}%`;
}

/**
 * The house `[docs-build]` line, then the coverage table, then every warning.
 *
 * Printing coverage on every run is the point of collecting it: it turns a
 * quality gap into a visible one and names the thin spots by area. It is
 * reported and never enforced — nothing here influences the exit code.
 *
 * That order is deliberate, and so is the completeness. A run warns about a
 * hundred or so things, all of them individually minor; leading with them
 * scrolls the counts and the table — the two things the command was run for —
 * off the top of the terminal, and capping them would hide the one warning that
 * mattered. Last and whole is the only arrangement that does neither.
 */
function printSummary(summary: GenSummary, docsRoot: string): void {
  const verb = summary.dryRun ? "would generate" : "generated";
  const into = path.basename(docsRoot);

  console.log(
    `[docs-build] ${verb} ${summary.pages} page(s), ${summary.symbols} symbol(s), ${summary.routes} route(s) in ${into}/`,
  );

  if (summary.coverage.length > 0) {
    const total: CoverageRow = {
      area: "all areas",
      symbols: summary.coverage.reduce((sum, row) => sum + row.symbols, 0),
      documented: summary.coverage.reduce(
        (sum, row) => sum + row.documented,
        0,
      ),
    };
    const rows = [...summary.coverage, total];
    const width = Math.max(...rows.map((row) => row.area.length));

    console.log("[docs-build] doc-comment coverage (reported, not enforced):");
    for (const row of rows) {
      console.log(
        `[docs-build]   ${row.area.padEnd(width)}  ${String(row.documented).padStart(5)} / ${String(row.symbols).padEnd(5)}  ${percent(row.documented, row.symbols).padStart(4)}`,
      );
    }
  }

  if (summary.warnings.length > 0) {
    // The count goes with the summary, where a reader is still looking, so the
    // block below is something they scroll into on purpose rather than a wall
    // of text they have to scroll back out of.
    console.log(
      `[docs-build] ${summary.warnings.length} warning(s), all of them below:`,
    );
    for (const warning of summary.warnings) {
      console.log(`[docs-build] warn: ${warning}`);
    }
  }
}

/* Paths ------------------------------------------------------------------ */

/**
 * The option wins, then the environment, then the default. The environment
 * variable is what a preview deployment sets to point "view source" at the
 * branch it was built from.
 */
function resolveSourceBaseUrl(fromOptions: string | undefined): string {
  const configured = fromOptions ?? process.env["DOCS_SOURCE_BASE_URL"];
  const chosen =
    configured !== undefined && configured.trim() !== ""
      ? configured.trim()
      : DEFAULT_SOURCE_BASE_URL;
  return trimSlash(chosen);
}

function toPosix(file: string): string {
  return file.replace(/\\/g, "/");
}

/**
 * The directory part of a repo-relative source path. Every `SourceRef` is
 * posix-separated by the time it reaches here, so this does not go through
 * `node:path` and pick up a backslash on Windows.
 */
function directoryOf(file: string): string {
  const at = file.lastIndexOf("/");
  return at === -1 ? "" : file.slice(0, at);
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function isDirectory(dir: string): boolean {
  return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function childEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
