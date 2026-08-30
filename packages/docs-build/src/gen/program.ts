/**
 * Everything the extractors share: what is in scope, how a file becomes an
 * import path, and one `ts.Program` per app or package to ask the checker with.
 *
 * The scope rule lives here and nowhere else, stated mechanically so it cannot
 * drift: every `.ts`/`.tsx` under `apps/*​/src` and `packages/*​/src`, minus
 * tests, minus the generated output nested inside those trees, minus
 * `node_modules`. There is deliberately no "is this important enough" filter.
 * That judgment belongs to the written guides, and a mechanical rule cannot
 * rot.
 */
import * as fs from "node:fs";
import * as ts from "typescript";
import type { SourceRef } from "./model.js";

/** A `tsconfig` path alias, reduced to the prefix rewriting an import needs. */
export interface AliasRule {
  /** `~/` */
  prefix: string;
  /** Absolute directory the prefix stands for. */
  dir: string;
}

/** One app or package the generator emits pages for. */
export interface Target {
  /** The `docs/` project this target's pages are written under. */
  docsProject: string;
  /** Repo-relative root: `apps/platform`, `packages/env`. */
  dir: string;
  /** Absolute path to that root. */
  absDir: string;
  /** Absolute path to `src/`. */
  srcDir: string;
  /** `package.json`'s name: `platform`, `@devdogsuga/env`. */
  packageName: string;
  kind: "app" | "package";
  /** Absolute path to the target's own `tsconfig.json`. */
  tsconfigPath: string;
  aliases: AliasRule[];
  /**
   * Absolute source files reachable through the package's `exports` map. The
   * one filter in this generator that is not a judgment: it is a public/private
   * line the package already declares. Empty for apps.
   */
  publicEntries: Set<string>;
  /**
   * The same entries keyed to the `exports` subpath that reaches them, `.` or
   * `./schema`, because `@devdogsuga/supabase/schemas` is what a reader types
   * and the file name alone cannot recover it.
   */
  publicSubpaths: Map<string, string>;
  /** Whether the target has an App Router at `src/app`. */
  hasAppRouter: boolean;
}

/** A target plus the checker, handed to each extractor. */
export interface TargetContext {
  repoRoot: string;
  target: Target;
  program: ts.Program;
  checker: ts.TypeChecker;
}

/** One export worth documenting. */
export interface ExportedSymbol {
  name: string;
  isDefault: boolean;
  declaration: ts.Declaration;
  symbol: ts.Symbol;
}

/**
 * Directory names that end scope at any depth, no matter what encloses them.
 * A dependency's sources are somebody else's documentation.
 */
const EXCLUDED_ANYWHERE = new Set(["node_modules"]);

/**
 * Directory names that end scope only *below* a target's `src/`. Nested there
 * they hold machine-generated schema output: the `supabase/drizzle/` and
 * `server/db/schema/generated/` trees under `apps/platform/src`, which the
 * database reference already covers from `devtools`. Documenting a generated
 * file twice is how two references start disagreeing.
 *
 * The depth restriction is the point. `packages/drizzle` is a hand-written
 * client factory named after the tool it wraps, and testing these names against
 * every segment of a path excluded the whole package on the strength of its
 * directory name alone. A package named after a tool is not that tool's output.
 */
const GENERATED_SEGMENTS = new Set(["generated", "drizzle"]);

/**
 * A hard cap on a printed type. This is a guard against a pathological generic
 * blowing up a page, not a display choice: the emitter has its own, narrower
 * limit for what fits in a table cell.
 */
const TYPE_STRING_LIMIT = 400;

/** Walks up from `from` until it finds `pnpm-workspace.yaml`. */
export function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (ts.sys.fileExists(`${dir}/pnpm-workspace.yaml`)) return dir;
    const parent = dir.slice(0, dir.lastIndexOf("/"));
    if (!parent || parent === dir) {
      throw new Error(`no pnpm-workspace.yaml above ${from}`);
    }
    dir = parent;
  }
}

/** Repo-relative, posix-separated. */
export function repoRelative(repoRoot: string, absFile: string): string {
  const normalised = absFile.replace(/\\/g, "/");
  const root = repoRoot.replace(/\\/g, "/").replace(/\/$/, "");
  return normalised.startsWith(`${root}/`)
    ? normalised.slice(root.length + 1)
    : normalised;
}

/**
 * The mechanical scope rule. `absFile` is absolute and posix-separated.
 *
 * Excluded: `*.test.ts(x)`, `*.db-test.ts`, `*.d.ts`, anything under a
 * `node_modules/` at any depth, and anything under a `generated/` or
 * `drizzle/` directory that lies *below* the target's `src/`, meaning in the
 * segments following the last `src` in the path.
 *
 * Where those two exclusions differ is the part that rots silently, so stated
 * as cases: `packages/drizzle/src/index.ts` is in scope, because a package
 * named after the tool it wraps is hand-written source and its directory name
 * says nothing about its contents. `packages/drizzle/src/generated/x.ts` and
 * `apps/platform/src/supabase/drizzle/schema.ts` are both out, because a
 * `drizzle/` or `generated/` folder *inside* a source tree really is machine
 * output that the database reference already covers.
 */
export function isInScope(absFile: string): boolean {
  const segments = toPosix(absFile).split("/");
  const basename = segments.at(-1) ?? "";

  if (!/\.tsx?$/.test(basename)) return false;
  if (/\.d\.ts$/.test(basename)) return false;
  if (/\.(?:test|db-test)\.tsx?$/.test(basename)) return false;

  const directories = segments.slice(0, -1);
  if (directories.some((segment) => EXCLUDED_ANYWHERE.has(segment))) {
    return false;
  }

  // A path with no `src` at all sends `lastIndexOf` to -1 and the slice back to
  // the front, reading every segment as nested. That is the conservative answer
  // for a file no target's `src/` contains, and the walk never produces one.
  const nested = directories.slice(directories.lastIndexOf("src") + 1);
  return !nested.some((segment) => GENERATED_SEGMENTS.has(segment));
}

/** Every app and package that has a `src/` and a `tsconfig.json`. */
export function discoverTargets(repoRoot: string): Target[] {
  const root = toPosix(repoRoot).replace(/\/$/, "");
  const targets: Target[] = [];

  for (const kind of ["app", "package"] as const) {
    const parent = `${root}/${kind === "app" ? "apps" : "packages"}`;

    for (const name of childDirectories(parent)) {
      const absDir = `${parent}/${name}`;
      const srcDir = `${absDir}/src`;
      const tsconfigPath = `${absDir}/tsconfig.json`;
      const manifestPath = `${absDir}/package.json`;

      // All three are required, which is what drops the Flutter app (no `src`),
      // `packages/config` (no `src`, no `tsconfig`) and the empty placeholder
      // packages without naming any of them here.
      if (!isDirectory(srcDir)) continue;
      if (!isFile(tsconfigPath) || !isFile(manifestPath)) continue;

      const manifest = readJsonObject(manifestPath);
      const declaredName = manifest?.["name"];
      const entries = readPublicEntries(absDir, manifest);

      targets.push({
        // Packages share one `toolkit` project; each app gets its own, named
        // after its directory.
        docsProject: kind === "app" ? name : "toolkit",
        dir: repoRelative(root, absDir),
        absDir,
        srcDir,
        packageName: typeof declaredName === "string" ? declaredName : name,
        kind,
        tsconfigPath,
        aliases: readAliases(absDir, tsconfigPath),
        publicEntries: entries.publicEntries,
        publicSubpaths: entries.publicSubpaths,
        hasAppRouter: isDirectory(`${srcDir}/app`),
      });
    }
  }

  targets.sort((a, b) => compareStrings(a.dir, b.dir));
  return targets;
}

/** In-scope source files for one target, absolute, sorted. */
export function sourceFilesFor(target: Target): string[] {
  const files: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of childEntries(dir)) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        // Redundant with `isInScope`, but it keeps the walk out of trees that
        // can hold tens of thousands of files. The walk starts at `src/`, so
        // every directory it reaches is nested and both sets apply.
        if (EXCLUDED_ANYWHERE.has(entry.name)) continue;
        if (GENERATED_SEGMENTS.has(entry.name)) continue;
        walk(child);
      } else if (entry.isFile() && isInScope(child)) {
        files.push(child);
      }
    }
  };

  walk(toPosix(target.srcDir));
  return files.sort(compareStrings);
}

/** A `ts.Program` over one target, using its own `tsconfig.json`. */
export function createProgram(target: Target): ts.Program {
  const raw: unknown = ts.readConfigFile(
    target.tsconfigPath,
    ts.sys.readFile,
  ).config;

  // Passing the config file name is what lets `extends` resolve; the presets
  // differ in `moduleResolution` (nodenext for the libraries, bundler for the
  // Worker and the Next apps) and that difference is deliberate, so nothing
  // here normalises the options it gets back.
  const parsed = ts.parseJsonConfigFileContent(
    raw ?? {},
    ts.sys,
    target.absDir,
    undefined,
    target.tsconfigPath,
  );

  // `parsed.errors` is deliberately ignored. A config the compiler complains
  // about still yields usable options, and a program that resolves fewer types
  // still produces most of a page. This generator is warn-only.
  return ts.createProgram(sourceFilesFor(target), {
    ...parsed.options,
    noEmit: true,
  });
}

/**
 * What a reader types to import from this file: `~/ui/button` for an app,
 * `@devdogsuga/env` (or a declared subpath) for a package.
 */
export function importPathFor(target: Target, absFile: string): string {
  const file = toPosix(absFile);

  for (const alias of target.aliases) {
    if (file.startsWith(`${alias.dir}/`)) {
      const rest = stripExtension(file.slice(alias.dir.length + 1));
      return `${alias.prefix}${stripIndexSuffix(rest)}`;
    }
  }

  const srcDir = toPosix(target.srcDir);

  if (target.kind === "app") {
    // `apps/sandbox` declares no alias, so a relative path is the honest answer.
    return file.startsWith(`${srcDir}/`)
      ? `./${stripExtension(file.slice(srcDir.length + 1))}`
      : stripExtension(file);
  }

  const subpath = target.publicSubpaths.get(file);
  if (subpath !== undefined) {
    return subpath === "."
      ? target.packageName
      : `${target.packageName}${subpath.slice(1)}`;
  }

  // Internal to the package: there is no import line that resolves, so the
  // repo-relative path is what the emitter renders as a source reference.
  // Printing an unreachable import is how a generator starts lying.
  const absDir = toPosix(target.absDir);
  return stripExtension(
    file.startsWith(`${absDir}/`)
      ? `${target.dir}/${file.slice(absDir.length + 1)}`
      : file,
  );
}

/** The leading doc comment as prose, verbatim, tags stripped. Null when absent. */
export function jsDocSummary(node: ts.Node): string | null {
  const parts: string[] = [];

  for (const doc of ts.getJSDocCommentsAndTags(jsDocHost(node))) {
    // Only the `JSDoc` nodes carry the leading prose; block tags are siblings
    // of it, which is what keeps `@param` out of the summary for free.
    if (!ts.isJSDoc(doc)) continue;
    const text = ts.getTextOfJSDocComment(doc.comment);
    if (text !== undefined && text.trim() !== "") parts.push(text);
  }

  const summary = collapseParagraphs(parts.join("\n\n"));
  return summary === "" ? null : summary;
}

/** `@param` descriptions on a declaration, keyed by parameter name. */
export function jsDocParams(node: ts.Node): Map<string, string> {
  const params = new Map<string, string>();

  for (const tag of ts.getJSDocTags(jsDocHost(node))) {
    if (!ts.isJSDocParameterTag(tag)) continue;
    const description = collapseParagraphs(
      ts.getTextOfJSDocComment(tag.comment) ?? "",
    );
    if (description === "") continue;
    params.set(entityNameToString(tag.name), description);
  }

  return params;
}

/** Whether a declaration carries `@deprecated`. */
export function isDeprecated(node: ts.Node): boolean {
  return ts
    .getJSDocTags(jsDocHost(node))
    .some((tag) => tag.tagName.text === "deprecated");
}

/** The file's leading `"use client"` / `"use server"` directives. */
export function fileDirectives(sourceFile: ts.SourceFile): {
  useClient: boolean;
  useServer: boolean;
} {
  let useClient = false;
  let useServer = false;

  // Only the prologue counts. A `"use server"` further down the file is a
  // string expression, not a directive, and treating it as one would put a
  // `server action` badge on something that is not client-reachable.
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement)) break;
    const expression = statement.expression;
    if (!ts.isStringLiteralLike(expression)) break;
    if (expression.text === "use client") useClient = true;
    else if (expression.text === "use server") useServer = true;
  }

  return { useClient, useServer };
}

/** File and 1-based line for a node. */
export function sourceRefFor(repoRoot: string, node: ts.Node): SourceRef {
  const sourceFile = node.getSourceFile();
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return {
    file: repoRelative(repoRoot, toPosix(sourceFile.fileName)),
    line: line + 1,
  };
}

/** Every exported symbol of a source file, in declaration order. */
export function exportsOf(
  program: ts.Program,
  sourceFile: ts.SourceFile,
): ExportedSymbol[] {
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) return [];

  const found: ExportedSymbol[] = [];

  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const declaration = declarationIn(checker, symbol, sourceFile);
    // A barrel re-exports dozens of symbols it does not declare. Each is
    // documented where it is written, so the barrel contributes nothing.
    if (declaration === undefined) continue;

    const isDefault = symbol.getName() === "default";
    found.push({
      name: isDefault
        ? defaultExportName(declaration, sourceFile)
        : symbol.getName(),
      isDefault,
      declaration,
      symbol,
    });
  }

  found.sort(
    (a, b) =>
      a.declaration.getStart(sourceFile) - b.declaration.getStart(sourceFile),
  );
  return found;
}

/**
 * The checker's rendering of a type, capped so a pathological generic cannot
 * produce a thousand-character table cell.
 */
export function typeToString(
  checker: ts.TypeChecker,
  type: ts.Type,
  enclosing?: ts.Node,
): string {
  const printed = checker
    .typeToString(
      type,
      enclosing,
      ts.TypeFormatFlags.NoTruncation |
        ts.TypeFormatFlags.InTypeAlias |
        ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType,
    )
    .replace(/\s+/g, " ")
    .trim();

  return printed.length > TYPE_STRING_LIMIT
    ? `${printed.slice(0, TYPE_STRING_LIMIT - 1)}…`
    : printed;
}

/* Paths ------------------------------------------------------------------ */

function toPosix(file: string): string {
  return file.replace(/\\/g, "/");
}

/** Collapses `.` and `..` so a joined path compares as a plain string. */
function normalisePath(file: string): string {
  const absolute = file.startsWith("/");
  const out: string[] = [];
  for (const segment of file.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return `${absolute ? "/" : ""}${out.join("/")}`;
}

function stripExtension(file: string): string {
  return file.replace(/\.(?:d\.ts|tsx?|jsx?)$/, "");
}

/** `~/ui/index` is written `~/ui`, unless that would leave nothing behind. */
function stripIndexSuffix(importPath: string): string {
  if (!importPath.endsWith("/index")) return importPath;
  const trimmed = importPath.slice(0, -"/index".length);
  return trimmed === "" ? importPath : trimmed;
}

/** `Array.prototype.sort`'s default coerces; this states the comparison. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/* Filesystem ------------------------------------------------------------- */

function isDirectory(path: string): boolean {
  return fs.statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function isFile(path: string): boolean {
  return fs.statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

function childEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function childDirectories(dir: string): string[] {
  return childEntries(dir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareStrings);
}

/* JSON ------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readJsonObject(file: string): Record<string, unknown> | null {
  const text = ts.sys.readFile(file);
  if (text === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

/* Target configuration --------------------------------------------------- */

/**
 * Aliases come from the target's own `tsconfig.json` and no further. TypeScript
 * resolves `paths` against the file that declares them, so a hoisted `~/*`
 * would point at the shared preset's directory. That is why only the two Next
 * apps declare one, and why chasing `extends` here would be wrong.
 */
function readAliases(absDir: string, tsconfigPath: string): AliasRule[] {
  const raw: unknown = ts.readConfigFile(tsconfigPath, ts.sys.readFile).config;
  const paths = asRecord(
    asRecord(asRecord(raw)?.["compilerOptions"])?.["paths"],
  );
  if (paths === null) return [];

  const rules: AliasRule[] = [];
  for (const [pattern, mapped] of Object.entries(paths)) {
    if (!pattern.endsWith("*")) continue;
    const candidates: unknown[] = Array.isArray(mapped)
      ? (mapped as unknown[])
      : [mapped];
    const first = candidates[0];
    if (typeof first !== "string" || !first.endsWith("*")) continue;

    rules.push({
      prefix: pattern.slice(0, -1),
      dir: normalisePath(`${absDir}/${first.slice(0, -1)}`),
    });
  }
  return rules;
}

/**
 * What the package makes public, read off `exports`. This is the only filter in
 * the generator that is not a judgment call: the package already drew the line,
 * so the generator does not have to.
 */
function readPublicEntries(
  absDir: string,
  manifest: Record<string, unknown> | null,
): { publicEntries: Set<string>; publicSubpaths: Map<string, string> } {
  const publicEntries = new Set<string>();
  const publicSubpaths = new Map<string, string>();

  for (const [subpath, value] of exportEntries(manifest?.["exports"])) {
    const declared = conditionTarget(value);
    if (declared === null) continue;
    const file = resolveEntryFile(absDir, declared);
    if (file === null) continue;

    publicEntries.add(file);
    // First declaration wins, so `.` beats a subpath aimed at the same file.
    if (!publicSubpaths.has(file)) publicSubpaths.set(file, subpath);
  }

  return { publicEntries, publicSubpaths };
}

/** `exports` is a subpath map, a bare conditions object, or a single string. */
function exportEntries(value: unknown): [string, unknown][] {
  if (typeof value === "string") return [[".", value]];

  const record = asRecord(value);
  if (record === null) return [];

  const entries = Object.entries(record);
  return entries.every(([key]) => key.startsWith("."))
    ? entries
    : [[".", record]];
}

function conditionTarget(value: unknown): string | null {
  if (typeof value === "string") return value;

  const record = asRecord(value);
  if (record === null) return null;

  // `types` first: it points at the declaration file, which maps back to the
  // source one-for-one. `default` is the fallback for the entries that predate
  // the dual-condition shape.
  for (const condition of ["types", "default"]) {
    const declared = record[condition];
    if (typeof declared === "string") return declared;
  }
  return null;
}

/**
 * `./dist/index.d.ts` is the built artifact; the page has to point at the
 * source that produced it, and every package here builds `src/` into `dist/`.
 */
function resolveEntryFile(absDir: string, declared: string): string | null {
  let relative = declared.replace(/^\.\//, "");
  if (relative.startsWith("dist/")) {
    relative = `src/${relative.slice("dist/".length)}`;
  }
  relative = relative.replace(/\.d\.ts$/, ".ts").replace(/\.[cm]?js$/, ".ts");

  const candidate = normalisePath(`${absDir}/${relative}`);
  if (isFile(candidate)) return candidate;

  const asTsx = candidate.replace(/\.ts$/, ".tsx");
  return isFile(asTsx) ? asTsx : null;
}

/* Doc comments ----------------------------------------------------------- */

/**
 * A `const`'s doc comment hangs off the `VariableStatement`, two nodes above
 * the declarator the extractors hand us. The walk is limited to exactly that
 * chain: anything wider would attribute an unrelated enclosing comment to the
 * symbol.
 */
function jsDocHost(node: ts.Node): ts.Node {
  let current: ts.Node = node;
  while (
    ts.getJSDocCommentsAndTags(current).length === 0 &&
    (ts.isVariableDeclaration(current) || ts.isVariableDeclarationList(current))
  ) {
    const parent: ts.Node | undefined = current.parent;
    if (parent === undefined) break;
    current = parent;
  }
  return current;
}

/**
 * Doc comments are hard-wrapped in the source and must not be hard-wrapped on
 * the page, so a single newline is a space and a blank line is a paragraph.
 */
function collapseParagraphs(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter((paragraph) => paragraph !== "")
    .join("\n\n")
    .trim();
}

/** `@param foo` and `@param foo.bar` both reach here as an entity name. */
function entityNameToString(name: ts.EntityName): string {
  return ts.isIdentifier(name)
    ? name.text
    : `${entityNameToString(name.left)}.${name.right.text}`;
}

/* Exports ---------------------------------------------------------------- */

/**
 * The declaration to document a symbol at, or `undefined` when that is another
 * file's job. An `export { x } from "./y"` produces an alias symbol whose own
 * declaration is the specifier in *this* file, so the alias has to be resolved
 * before asking where the thing actually lives.
 */
function declarationIn(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  sourceFile: ts.SourceFile,
): ts.Declaration | undefined {
  let resolved = symbol;
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    try {
      resolved = checker.getAliasedSymbol(symbol);
    } catch {
      // An unresolvable alias keeps its own declarations, which is enough to
      // decide the file it belongs to.
    }
  }

  const declarations = resolved.getDeclarations() ?? [];
  const local = declarations.find(
    (declaration) => declaration.getSourceFile() === sourceFile,
  );
  return local;
}

/**
 * `export default function Button()` still has a name to import it by, and a
 * reader needs one either way. An anonymous default falls back to the file
 * name, which is the convention the codebase already imports it under.
 */
function defaultExportName(
  declaration: ts.Declaration,
  sourceFile: ts.SourceFile,
): string {
  const name = ts.getNameOfDeclaration(declaration);
  if (name !== undefined && ts.isIdentifier(name)) return name.text;

  const basename = stripExtension(
    toPosix(sourceFile.fileName).split("/").at(-1) ?? "",
  );
  const pascal = basename
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== "")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  return pascal === "" ? "default" : pascal;
}
