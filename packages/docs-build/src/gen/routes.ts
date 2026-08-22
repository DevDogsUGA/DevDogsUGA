/**
 * The App Router extractor: one row per routable directory, read off the
 * directory tree.
 *
 * The tree already *is* the enumeration of the surface — 42 pages and 22
 * handlers across the two Next apps — and it is the part no written page has
 * ever kept current. Everything here is derived from a file that must exist for
 * the route to exist at all, so a route cannot be missing from the table
 * without also being missing from the app.
 *
 * Two things a reader cannot see from the tree get resolved here: the layouts a
 * segment inherits from every directory above it, and which HTTP methods a
 * `route.ts` actually implements.
 */
import * as fs from "node:fs";
import * as ts from "typescript";
import type { ExtractResult, RouteEntry } from "./model.js";
import { emptyResult } from "./model.js";
import type { TargetContext } from "./program.js";
import { repoRelative } from "./program.js";

/** The order Next's own reference lists them in, which is the order to scan. */
const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

/** Route-segment config as Next defines it. Any other export is just an export. */
const SEGMENT_CONFIG = new Set([
  "dynamic",
  "revalidate",
  "runtime",
  "fetchCache",
  "preferredRegion",
  "experimental_ppr",
  "maxDuration",
]);

const PAGE_FILES = ["page.tsx", "page.ts"];
const ROUTE_FILES = ["route.ts", "route.tsx"];
const LAYOUT_FILES = ["layout.tsx", "layout.ts"];
const LOADING_FILES = ["loading.tsx", "loading.ts"];
const ERROR_FILES = ["error.tsx", "error.ts"];
const NOT_FOUND_FILES = ["not-found.tsx", "not-found.ts"];
const DEFAULT_FILES = ["default.tsx", "default.ts"];

/** What a page or a handler exports, as far as it can be read statically. */
interface FileFacts {
  methods: string[];
  title: string | null;
  config: Record<string, string>;
}

/** One routable directory, before it becomes a `RouteEntry`. */
interface RoutableDirectory {
  dir: string;
  /** URL segments from `app/` down, route groups already dropped. */
  segments: string[];
  /** Every layout from `app/` down to and including this directory. */
  layouts: string[];
  page: string | null;
  route: string | null;
  names: Set<string>;
}

export function extractRoutes(ctx: TargetContext): ExtractResult {
  // `hasAppRouter` is the entire precondition: the packages and `apps/sandbox`
  // have no `src/app`, and an extractor that is skipped has to compose like one
  // that ran.
  if (!ctx.target.hasAppRouter) return emptyResult();

  const routes: RouteEntry[] = [];
  const warnings: string[] = [];

  walk(ctx, `${ctx.target.srcDir}/app`, [], [], routes, warnings);
  routes.sort((a, b) => compareStrings(a.url, b.url));

  return { groups: [], routes, coverage: [], warnings };
}

function walk(
  ctx: TargetContext,
  dir: string,
  segments: string[],
  inherited: string[],
  routes: RouteEntry[],
  warnings: string[],
): void {
  const entries = childEntries(dir);
  const names = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  );

  const layout = firstPresent(dir, names, LAYOUT_FILES);
  const layouts = layout === null ? inherited : [...inherited, layout];

  const page = firstPresent(dir, names, PAGE_FILES);
  const route = firstPresent(dir, names, ROUTE_FILES);

  if (page !== null || route !== null) {
    routes.push(
      entryFor(ctx, { dir, segments, layouts, page, route, names }, warnings),
    );
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // A `_private` folder opts out of routing entirely. A route group or a
    // parallel slot stays in the tree but contributes no URL segment.
    if (entry.name.startsWith("_") || entry.name === "node_modules") continue;

    walk(
      ctx,
      `${dir}/${entry.name}`,
      isTransparent(entry.name) ? segments : [...segments, entry.name],
      layouts,
      routes,
      warnings,
    );
  }
}

function entryFor(
  ctx: TargetContext,
  found: RoutableDirectory,
  warnings: string[],
): RouteEntry {
  const { dir, segments, layouts, page, route, names } = found;
  const relative = (file: string): string => repoRelative(ctx.repoRoot, file);

  if (page !== null && route !== null) {
    warnings.push(
      `${relative(dir)}: holds both a page and a route handler, which Next refuses to serve; the table describes the handler.`,
    );
  }

  // Non-null by construction — `entryFor` is only reached when one of them is
  // present — and the handler wins, because it is what the URL resolves to.
  const backing = route ?? page ?? dir;
  const facts = analyse(ctx, backing, warnings);

  const files: RouteEntry["files"] = {};
  if (page !== null) files.page = relative(page);
  if (route !== null) files.route = relative(route);
  // Layouts wrap pages and nothing else. Listing the root layout under a
  // handler that returns a `Response` would describe a wrapper that never runs.
  if (route === null && layouts.length > 0) {
    files.layout = layouts.map(relative);
  }

  const loading = firstPresent(dir, names, LOADING_FILES);
  if (loading !== null) files.loading = relative(loading);
  const error = firstPresent(dir, names, ERROR_FILES);
  if (error !== null) files.error = relative(error);
  const notFound = firstPresent(dir, names, NOT_FOUND_FILES);
  if (notFound !== null) files.notFound = relative(notFound);
  const fallback = firstPresent(dir, names, DEFAULT_FILES);
  if (fallback !== null) files.default = relative(fallback);

  return {
    url: segments.length === 0 ? "/" : `/${segments.join("/")}`,
    files,
    methods: facts.methods,
    title: facts.title,
    config: facts.config,
    isApi: route !== null,
    // The line is always 1: the route is the file, not a declaration in it.
    source: { file: relative(backing), line: 1 },
  };
}

/* The backing file ------------------------------------------------------- */

/**
 * What the page or handler exports. Read off the statements rather than through
 * the checker, because every one of these is a literal the compiler would
 * happily widen — and `dynamic = "force-dynamic"` is worth printing as written.
 */
function analyse(
  ctx: TargetContext,
  absFile: string,
  warnings: string[],
): FileFacts {
  const facts: FileFacts = { methods: [], title: null, config: {} };

  const sourceFile = ctx.program.getSourceFile(absFile);
  if (sourceFile === undefined) {
    warnings.push(
      `${repoRelative(ctx.repoRoot, absFile)}: the program did not load this file, so its methods and metadata are missing.`,
    );
    return facts;
  }

  const exported = new Set<string>();
  let metadata: ts.Expression | null = null;

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) continue;

    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name !== undefined) exported.add(statement.name.text);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const name = declaration.name.text;
        exported.add(name);

        if (declaration.initializer === undefined) continue;
        if (name === "metadata") metadata = declaration.initializer;
        else if (SEGMENT_CONFIG.has(name)) {
          facts.config[name] = collapse(declaration.initializer.getText());
        }
      }
      continue;
    }

    // `export { handler as GET }` is a legal way to write a handler, and the
    // name is all this needs from it.
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        exported.add(element.name.text);
      }
    }
  }

  facts.methods = HTTP_METHODS.filter((method) => exported.has(method));
  // `generateMetadata` runs per request against data this generator does not
  // have. A dash is the honest answer; a guessed title is not.
  facts.title =
    exported.has("generateMetadata") || metadata === null
      ? null
      : titleOf(metadata);

  return facts;
}

/**
 * `export const metadata`'s title, when it is written as a literal. The
 * `{ default, template }` form is the one layouts use, and its `default` is the
 * title a reader actually sees.
 */
function titleOf(metadata: ts.Expression): string | null {
  const object = unwrap(metadata);
  if (!ts.isObjectLiteralExpression(object)) return null;

  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (nameOf(property.name) !== "title") continue;

    const value = unwrap(property.initializer);
    if (ts.isStringLiteralLike(value)) return value.text;
    if (!ts.isObjectLiteralExpression(value)) return null;

    for (const nested of value.properties) {
      if (!ts.isPropertyAssignment(nested)) continue;
      if (nameOf(nested.name) !== "default") continue;
      const fallback = unwrap(nested.initializer);
      return ts.isStringLiteralLike(fallback) ? fallback.text : null;
    }
    return null;
  }

  return null;
}

function isExported(statement: ts.Statement): boolean {
  if (ts.isExportDeclaration(statement)) return true;
  if (!ts.canHaveModifiers(statement)) return false;
  return (
    ts
      .getModifiers(statement)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
    false
  );
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function nameOf(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}

/* The tree --------------------------------------------------------------- */

/**
 * `(site)` and `@modal` are organisation, not URL. This tests for a name that
 * is *entirely* parenthesised, which is what keeps the intercepting-route
 * prefixes — `(.)photo`, `(..)feed` — as the real segments they are.
 */
function isTransparent(name: string): boolean {
  return /^\(.*\)$/.test(name) || name.startsWith("@");
}

function firstPresent(
  dir: string,
  names: Set<string>,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    if (names.has(candidate)) return `${dir}/${candidate}`;
  }
  return null;
}

function childEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `Array.prototype.sort`'s default coerces; this states the comparison. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
