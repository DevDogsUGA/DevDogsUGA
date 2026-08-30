/**
 * Everything under `src/` that is not a component, a piece of `ui`, or a route.
 *
 * That is the largest part of the reference by a wide margin: server actions,
 * hooks, `lib` helpers, the server modules, and the whole of every package. It
 * is also the best documented, with roughly two thirds of these exports already
 * carrying a doc comment. Most of the value here is therefore not analysis, it
 * is transport: quote what the author already wrote, next to a signature that
 * cannot go stale, on a page named after the folder the reader was going to
 * open anyway.
 *
 * The one page that is more than transport is `reference/server-actions`. Every
 * export of a `"use server"` file is an RPC endpoint any browser can call with
 * no route in front of it, and that set is otherwise scattered across a dozen
 * folders. Collecting it answers a question the folder pages cannot, "what can
 * a client reach", so the symbols are deliberately listed twice.
 */
import * as ts from "typescript";
import type {
  CoverageRow,
  DocGroup,
  DocSymbol,
  ExtractResult,
  ParamDoc,
  SymbolKind,
  SymbolTag,
} from "./model.js";
import {
  exportsOf,
  fileDirectives,
  importPathFor,
  isDeprecated,
  isInScope,
  jsDocParams,
  jsDocSummary,
  repoRelative,
  sourceRefFor,
  typeToString,
  type ExportedSymbol,
  type Target,
  type TargetContext,
} from "./program.js";

/** `useShare`, but not `User` and not `usage`. */
const HOOK_NAME = /^use[A-Z]/;

/**
 * Directories the other two extractors own. Splitting on the directory rather
 * than on what a symbol looks like keeps the three from ever documenting the
 * same export twice: a helper living beside a component is that extractor's,
 * and a component living in `lib` is this one's.
 */
const FOREIGN_DIRECTORIES = ["components", "ui", "app"];

/**
 * How many members of an interface the shape prints before it says how many are
 * left. A shape is an orientation aid, with the source link there for the rest,
 * and a hundred-row block is neither.
 */
const SHAPE_MEMBER_LIMIT = 40;

/**
 * Past this much source text, a declaration gets the checker's *truncating*
 * printer instead of the exhaustive one. `packages/supabase/src/database.types`
 * declares a single alias that runs to three thousand lines; `NoTruncation`
 * means the printer walks all of it to build a string the page then cuts to a
 * few hundred characters. Truncating up front costs the reader nothing they
 * would have seen and saves materialising the whole thing.
 */
const CHECKER_PRINT_LIMIT = 4000;

/** The same cap `program.ts` puts on a printed type, applied to source text. */
const SOURCE_TEXT_LIMIT = 400;

/** What the resolver recovers from the checker; all of it can fail. */
interface Resolution {
  signature: string | null;
  params: ParamDoc[];
  returns: string | null;
  shape: string | null;
}

const UNRESOLVED: Resolution = {
  signature: null,
  params: [],
  returns: null,
  shape: null,
};

/** A group under construction, before it knows its order. */
interface GroupDraft {
  path: string;
  /** Directory relative to `src/`, empty for a file sitting in `src/` itself. */
  relative: string;
  /** Repo-relative directory the page covers, which the description names. */
  directory: string;
  symbols: DocSymbol[];
}

/**
 * Every export of every in-scope file the component and route extractors do
 * not claim, grouped by the directory it lives in.
 */
export function extractFunctions(ctx: TargetContext): ExtractResult {
  const warnings: string[] = [];
  const drafts = new Map<string, GroupDraft>();
  const actions: DocSymbol[] = [];

  for (const sourceFile of scopedFiles(ctx)) {
    const directives = fileDirectives(sourceFile);
    const file = toPosix(sourceFile.fileName);

    for (const exported of exportsOf(ctx.program, sourceFile)) {
      const symbol = describe(ctx, exported, directives, warnings);
      draftFor(ctx.target, drafts, file).symbols.push(symbol);
      if (symbol.tags.includes("server action")) actions.push(symbol);
    }
  }

  const groups = orderedGroups(ctx.target, drafts);
  if (actions.length > 0) {
    groups.unshift(serverActionsGroup(ctx.target, actions));
  }

  return {
    groups,
    routes: [],
    coverage: groups.map(coverageOf),
    warnings,
  };
}

/* Scope ------------------------------------------------------------------ */

/**
 * The target's own sources, read off the program rather than the filesystem so
 * that what is documented is exactly what was typechecked. The program also
 * holds every `lib.*.d.ts` and every dependency it followed, which is what the
 * `src/` prefix test is for.
 */
function scopedFiles(ctx: TargetContext): ts.SourceFile[] {
  const srcDir = toPosix(ctx.target.srcDir).replace(/\/$/, "");
  const foreign = FOREIGN_DIRECTORIES.map((name) => `${srcDir}/${name}/`);

  return ctx.program
    .getSourceFiles()
    .filter((sourceFile) => {
      if (sourceFile.isDeclarationFile) return false;
      const file = toPosix(sourceFile.fileName);
      if (!file.startsWith(`${srcDir}/`)) return false;
      if (!isInScope(file)) return false;
      return !foreign.some((prefix) => file.startsWith(prefix));
    })
    .sort((a, b) => compare(a.fileName, b.fileName));
}

/* Symbols ---------------------------------------------------------------- */

/**
 * One export as the emitter wants it. Nothing in here throws: a symbol whose
 * type will not resolve still has a name, a doc comment, a source line and its
 * tags, and a page missing one signature is worth more than a build that
 * stopped.
 */
function describe(
  ctx: TargetContext,
  exported: ExportedSymbol,
  directives: { useClient: boolean; useServer: boolean },
  warnings: string[],
): DocSymbol {
  const { declaration } = exported;
  const file = toPosix(declaration.getSourceFile().fileName);
  const signatures = isTypeDeclaration(declaration)
    ? []
    : callSignaturesOf(ctx, exported);
  const kind = kindOf(exported, signatures);

  let resolution = UNRESOLVED;
  try {
    resolution = resolve(ctx, exported, kind, signatures, warnings);
  } catch (error) {
    warnings.push(
      `${repoRelative(ctx.repoRoot, file)}: could not resolve \`${
        exported.name
      }\` — ${messageOf(error)}`,
    );
  }

  return {
    name: exported.name,
    kind,
    importPath: importPathFor(ctx.target, file),
    importStyle: exported.isDefault ? "default" : "named",
    summary: jsDocSummary(declaration),
    signature: resolution.signature,
    params: resolution.params,
    paramsLabel: resolution.params.length > 0 ? "Parameter" : null,
    returns: resolution.returns,
    shape: resolution.shape,
    tags: tagsFor(ctx.target, exported, kind, directives, file),
    source: sourceRefFor(ctx.repoRoot, declaration),
  };
}

/**
 * What a symbol is, decided from its declaration and its call signatures and
 * from nothing else. Shape is asked before the name, because a type can be
 * called anything and a type filed under "Hooks" is not something a reader can
 * call.
 */
function kindOf(
  exported: ExportedSymbol,
  signatures: readonly ts.Signature[],
): SymbolKind {
  if (isTypeDeclaration(exported.declaration)) return "type";
  if (HOOK_NAME.test(exported.name)) return "hook";

  // A class has no call signature and is still something you invoke, so it is
  // asked about before the call signatures are.
  if (ts.isClassDeclaration(exported.declaration)) return "function";

  // `export const cn = (…) => …` is a function by every measure a caller cares
  // about; `export const EVENT_TZ = "America/New_York"` is not, and neither is
  // the `export default { fetch }` a Worker's entry point is written as.
  return signatures.length > 0 ? "function" : "constant";
}

function isTypeDeclaration(declaration: ts.Declaration): boolean {
  return (
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isInterfaceDeclaration(declaration)
  );
}

/**
 * Tags, every one of them read off the source. The two that matter most are
 * free: the `"use server"` prologue and the package's own `exports` map already
 * draw the client-reachable and the public/private lines, so neither is a
 * judgment this generator has to make or anybody has to maintain.
 */
function tagsFor(
  target: Target,
  exported: ExportedSymbol,
  kind: SymbolKind,
  directives: { useClient: boolean; useServer: boolean },
  file: string,
): SymbolTag[] {
  const tags: SymbolTag[] = [];

  if (directives.useServer) tags.push("server action");
  if (directives.useClient) tags.push("client");
  if (kind === "hook") tags.push("hook");
  if (exported.isDefault) tags.push("default export");
  if (isDeprecated(exported.declaration)) tags.push("deprecated");

  // An app publishes nothing: everything in it is internal to the app, so
  // tagging would put a badge on every symbol that says nothing. Only a package
  // has drawn the line.
  if (target.kind === "package") {
    tags.push(target.publicEntries.has(file) ? "public" : "internal");
  }

  return tags;
}

/* Signatures ------------------------------------------------------------- */

function resolve(
  ctx: TargetContext,
  exported: ExportedSymbol,
  kind: SymbolKind,
  signatures: readonly ts.Signature[],
  warnings: string[],
): Resolution {
  const { declaration } = exported;

  if (kind === "type") {
    return { ...UNRESOLVED, shape: shapeOf(ctx, exported, warnings) };
  }

  if (ts.isClassDeclaration(declaration)) {
    return classResolution(ctx, exported, declaration);
  }

  const first = signatures.at(0);
  if (first === undefined) return constantResolution(ctx, exported);

  if (signatures.length > 1) {
    // The emitter renders one signature, and picking the first is the same
    // choice the language service makes. Saying so beats a page that quietly
    // documents a third of a symbol.
    warnings.push(
      `${sourceLabel(ctx, declaration)}: \`${exported.name}\` has ${
        signatures.length
      } overloads; the reference shows the first.`,
    );
  }

  return callableResolution(ctx, exported, first);
}

function callableResolution(
  ctx: TargetContext,
  exported: ExportedSymbol,
  signature: ts.Signature,
): Resolution {
  const { declaration } = exported;
  const printed = signatureText(ctx, declaration, signature);
  const returned = typeToString(
    ctx.checker,
    signature.getReturnType(),
    declaration,
  );

  return {
    signature: `function ${exported.name}${printed}`,
    params: paramsFor(ctx, declaration, signature),
    // A "Returns `void`" line is a row that says nothing. Every other return
    // type is the reason somebody called the thing.
    returns: returned === "void" ? null : returned,
    shape: null,
  };
}

function constantResolution(
  ctx: TargetContext,
  exported: ExportedSymbol,
): Resolution {
  const type = valueTypeOf(ctx, exported);
  const printed =
    type === null ? null : printType(ctx, type, exported.declaration);

  return {
    ...UNRESOLVED,
    signature:
      printed === null
        ? `const ${exported.name}`
        : `const ${exported.name}: ${printed}`,
  };
}

/**
 * A class documents as a function, because the emitter's `class` kind is the
 * Dart one and would fence this in `dart`. `class Name extends Error` plus the
 * constructor's arguments is what a reader needs to write `new`, and the
 * heritage clause is the whole story for most of these: they are error types.
 */
function classResolution(
  ctx: TargetContext,
  exported: ExportedSymbol,
  declaration: ts.ClassDeclaration,
): Resolution {
  const type = valueTypeOf(ctx, exported);
  const constructor = type?.getConstructSignatures().at(0);

  return {
    ...UNRESOLVED,
    signature: `class ${exported.name}${typeParametersText(
      declaration,
    )}${heritageText(declaration)}`,
    params:
      constructor === undefined ? [] : paramsFor(ctx, declaration, constructor),
  };
}

function signatureText(
  ctx: TargetContext,
  enclosing: ts.Node,
  signature: ts.Signature,
): string {
  return truncate(
    collapse(
      ctx.checker.signatureToString(
        signature,
        enclosing,
        ts.TypeFormatFlags.NoTruncation |
          ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType,
        ts.SignatureKind.Call,
      ),
    ),
  );
}

/* Parameters ------------------------------------------------------------- */

function paramsFor(
  ctx: TargetContext,
  declaration: ts.Declaration,
  signature: ts.Signature,
): ParamDoc[] {
  const documented = jsDocParams(declaration);
  const parameters = signature.getParameters();

  const sole = parameters.length === 1 ? parameters.at(0) : undefined;
  if (sole !== undefined) {
    const expanded = expandOptionsParameter(ctx, sole, documented);
    if (expanded !== null) return expanded;
  }

  return parameters.map((parameter) =>
    plainParam(ctx, declaration, parameter, documented),
  );
}

/**
 * A lone destructured parameter is an options bag, and `{ signingKey, now }` as
 * a single table row tells a reader nothing the call site would not have. The
 * properties are the real arguments, so they are what the table lists. This is
 * the prevailing idiom in the repo, so it is most of the tables here.
 *
 * The type's properties are the source of truth rather than the binding
 * elements: an option the function does not destructure is still an option the
 * caller may pass.
 */
function expandOptionsParameter(
  ctx: TargetContext,
  parameter: ts.Symbol,
  documented: Map<string, string>,
): ParamDoc[] | null {
  const declaration = parameter.valueDeclaration;
  if (declaration === undefined || !ts.isParameter(declaration)) return null;
  if (!ts.isObjectBindingPattern(declaration.name)) return null;

  const properties = ctx.checker.getTypeAtLocation(declaration).getProperties();
  if (properties.length === 0) return null;

  const defaults = bindingDefaults(declaration.name);

  return properties.map((property) => {
    const name = property.getName();
    const fallback = defaults.get(name) ?? null;
    const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;

    return {
      name,
      type: stripUndefined(typeOfSymbol(ctx, property, declaration), optional),
      required: !optional && fallback === null,
      default: fallback,
      description:
        propertyDescription(property) ?? matchParamTag(documented, name),
    };
  });
}

function plainParam(
  ctx: TargetContext,
  enclosing: ts.Declaration,
  parameter: ts.Symbol,
  documented: Map<string, string>,
): ParamDoc {
  const declaration = parameter.valueDeclaration;
  const written =
    declaration !== undefined && ts.isParameter(declaration)
      ? declaration
      : undefined;
  const initialiser = written?.initializer;

  return {
    name: written === undefined ? parameter.getName() : parameterName(written),
    type: typeOfSymbol(ctx, parameter, written ?? enclosing),
    // An optional parameter and one with a default are the same thing to a
    // caller: both may be left out of the call.
    required: written?.questionToken === undefined && initialiser === undefined,
    default:
      initialiser === undefined
        ? null
        : truncate(collapse(initialiser.getText())),
    description: matchParamTag(documented, parameter.getName()),
  };
}

/** `...rest` and `{ title, url }` are both names a reader recognises. */
function parameterName(declaration: ts.ParameterDeclaration): string {
  const written = ts.isIdentifier(declaration.name)
    ? declaration.name.text
    : collapse(declaration.name.getText());
  return declaration.dotDotDotToken === undefined ? written : `...${written}`;
}

/**
 * Defaults live on the binding pattern, not on the type: `{ now = Date.now() }`
 * destructures an optional property into a guaranteed value, and which value is
 * exactly what the reader is looking for.
 */
function bindingDefaults(
  pattern: ts.ObjectBindingPattern,
): Map<string, string> {
  const defaults = new Map<string, string>();

  for (const element of pattern.elements) {
    if (element.initializer === undefined) continue;
    const key = element.propertyName ?? element.name;
    if (!ts.isIdentifier(key)) continue;
    defaults.set(key.text, truncate(collapse(element.initializer.getText())));
  }

  return defaults;
}

/** `@param options.now` and `@param now` describe the same row. */
function matchParamTag(
  documented: Map<string, string>,
  name: string,
): string | null {
  const direct = documented.get(name);
  if (direct !== undefined) return direct;

  for (const [key, description] of documented) {
    if (key.endsWith(`.${name}`)) return description;
  }
  return null;
}

/** An options property's own doc comment, which is where these usually live. */
function propertyDescription(property: ts.Symbol): string | null {
  const declaration = property.valueDeclaration ?? property.declarations?.at(0);
  return declaration === undefined ? null : jsDocSummary(declaration);
}

/* Type shapes ------------------------------------------------------------ */

function shapeOf(
  ctx: TargetContext,
  exported: ExportedSymbol,
  warnings: string[],
): string | null {
  const { declaration } = exported;
  if (ts.isInterfaceDeclaration(declaration)) {
    return interfaceShape(ctx, declaration);
  }
  if (ts.isTypeAliasDeclaration(declaration)) {
    return aliasShape(ctx, declaration, warnings);
  }
  return null;
}

/**
 * An interface prints member by member rather than through `typeToString`,
 * which answers with the interface's own name. Each member's type comes from
 * the checker, so `InferSelectModel<typeof users>` resolves. One level and no
 * further: `Promise<Team>` stays `Promise<Team>`, because a reader looking up
 * one type does not want three inlined.
 */
function interfaceShape(
  ctx: TargetContext,
  declaration: ts.InterfaceDeclaration,
): string {
  const header = `interface ${declaration.name.text}${typeParametersText(
    declaration,
  )}${heritageText(declaration)}`;

  const members = declaration.members;
  if (members.length === 0) return `${header} {}`;

  const lines = members
    .slice(0, SHAPE_MEMBER_LIMIT)
    .map((member) => `  ${memberText(ctx, member)}`);

  if (members.length > SHAPE_MEMBER_LIMIT) {
    lines.push(`  // …${members.length - SHAPE_MEMBER_LIMIT} more`);
  }

  return `${header} {\n${lines.join("\n")}\n}`;
}

function memberText(ctx: TargetContext, member: ts.TypeElement): string {
  // Index, call and construct signatures have no name to hang a type off, and
  // what the author wrote is already the clearest form of them.
  if (member.name === undefined) return `${collapse(member.getText())};`;

  const optional = member.questionToken !== undefined;
  const resolved = stripUndefined(memberType(ctx, member), optional);
  return `${collapse(member.name.getText())}${optional ? "?" : ""}: ${resolved};`;
}

function memberType(ctx: TargetContext, member: ts.TypeElement): string {
  try {
    return typeToString(
      ctx.checker,
      ctx.checker.getTypeAtLocation(member),
      member,
    );
  } catch {
    return "unknown";
  }
}

/**
 * An alias prints its right-hand side as the checker resolves it, which is the
 * point of generating this at all: `InferSelectModel<typeof subjects>` becomes
 * the row. When the checker answers with the alias's own name it has resolved
 * nothing, and the written form is what the reader wanted anyway.
 */
function aliasShape(
  ctx: TargetContext,
  declaration: ts.TypeAliasDeclaration,
  warnings: string[],
): string {
  const header = `type ${declaration.name.text}${typeParametersText(
    declaration,
  )} =`;
  const written = truncate(collapse(declaration.type.getText()));

  let printed: string;
  try {
    printed = printType(
      ctx,
      ctx.checker.getTypeAtLocation(declaration.type),
      declaration,
    );
  } catch (error) {
    warnings.push(
      `${sourceLabel(ctx, declaration)}: \`${
        declaration.name.text
      }\` did not resolve — ${messageOf(error)}`,
    );
    return `${header} ${written};`;
  }

  const resolved =
    printed === "" || printed === declaration.name.text ? written : printed;
  return `${header} ${resolved};`;
}

function typeParametersText(
  declaration:
    ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
): string {
  const parameters = declaration.typeParameters;
  if (parameters === undefined || parameters.length === 0) return "";
  return `<${parameters.map((p) => collapse(p.getText())).join(", ")}>`;
}

function heritageText(
  declaration: ts.ClassDeclaration | ts.InterfaceDeclaration,
): string {
  const clauses = declaration.heritageClauses ?? [];
  const text = clauses.map((clause) => collapse(clause.getText())).join(" ");
  return text === "" ? "" : ` ${text}`;
}

/** The `?` already said it, so `string | undefined` is one word too many. */
function stripUndefined(type: string, optional: boolean): string {
  const suffix = " | undefined";
  return optional && type.endsWith(suffix)
    ? type.slice(0, -suffix.length)
    : type;
}

/* Checker access --------------------------------------------------------- */

/**
 * The value behind an export. `getTypeOfSymbolAtLocation` resolves an alias on
 * the way, which is what makes `export default handler` document as the
 * function it points at.
 */
function valueTypeOf(
  ctx: TargetContext,
  exported: ExportedSymbol,
): ts.Type | null {
  try {
    return ctx.checker.getTypeOfSymbolAtLocation(
      exported.symbol,
      exported.declaration,
    );
  } catch {
    return null;
  }
}

function callSignaturesOf(
  ctx: TargetContext,
  exported: ExportedSymbol,
): readonly ts.Signature[] {
  const type = valueTypeOf(ctx, exported);
  if (type === null) return [];
  try {
    return type.getCallSignatures();
  } catch {
    return [];
  }
}

function typeOfSymbol(
  ctx: TargetContext,
  symbol: ts.Symbol,
  location: ts.Node,
): string {
  try {
    return typeToString(
      ctx.checker,
      ctx.checker.getTypeOfSymbolAtLocation(symbol, location),
      location,
    );
  } catch {
    return "unknown";
  }
}

/**
 * `NoTruncation` asks the printer to walk a type in full. That is right for
 * everything a person wrote by hand and wrong for the generated Supabase
 * schema, so the size of the declaration decides which printer answers.
 */
function printType(
  ctx: TargetContext,
  type: ts.Type,
  declaration: ts.Declaration,
): string {
  if (declaration.getWidth() <= CHECKER_PRINT_LIMIT) {
    return typeToString(ctx.checker, type, declaration);
  }
  return truncate(
    collapse(
      ctx.checker.typeToString(
        type,
        declaration,
        ts.TypeFormatFlags.InTypeAlias |
          ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType,
      ),
    ),
  );
}

/* Grouping --------------------------------------------------------------- */

function draftFor(
  target: Target,
  drafts: Map<string, GroupDraft>,
  file: string,
): GroupDraft {
  const relative = directoryUnderSrc(target, file);
  const path = groupPath(target, relative);

  const existing = drafts.get(path);
  if (existing !== undefined) return existing;

  const draft: GroupDraft = {
    path,
    relative,
    directory:
      relative === "" ? `${target.dir}/src` : `${target.dir}/src/${relative}`,
    symbols: [],
  };
  drafts.set(path, draft);
  return draft;
}

/** `apps/platform/src/server/db/index.ts` → `server/db`; `src/index.ts` → ``. */
function directoryUnderSrc(target: Target, file: string): string {
  const srcDir = toPosix(target.srcDir).replace(/\/$/, "");
  if (!file.startsWith(`${srcDir}/`)) return "";
  return file
    .slice(srcDir.length + 1)
    .split("/")
    .slice(0, -1)
    .join("/");
}

/**
 * The page path mirrors the import path, because that is what a reader has in
 * front of them when they come looking. Packages nest one level further, under
 * `api/<package>`, so that eight libraries sharing the `toolkit` project do not
 * collide in one flat folder.
 */
function groupPath(target: Target, relative: string): string {
  if (target.kind === "app") {
    // A file sitting directly in `src/` still needs a page, and `src` is the
    // segment the reader sees in its path.
    return `${target.docsProject}/reference/${relative === "" ? "src" : relative}`;
  }

  const base = `${target.docsProject}/reference/api/${shortPackageName(
    target.packageName,
  )}`;
  return relative === "" ? base : `${base}/${relative}`;
}

function shortPackageName(packageName: string): string {
  const slash = packageName.lastIndexOf("/");
  return slash === -1 ? packageName : packageName.slice(slash + 1);
}

function orderedGroups(
  target: Target,
  drafts: Map<string, GroupDraft>,
): DocGroup[] {
  const sorted = [...drafts.values()].sort((a, b) => compare(a.path, b.path));

  return sorted.map((draft, index) => ({
    path: draft.path,
    title: groupTitle(target, draft),
    description: groupDescription(target, draft),
    // 200 leaves the whole range below it to the written guides, which are the
    // pages a reader should meet first.
    order: 200 + index,
    symbols: [...draft.symbols].sort(bySymbolName),
  }));
}

function groupTitle(target: Target, draft: GroupDraft): string {
  if (target.kind === "app")
    return draft.relative === "" ? "src" : draft.relative;

  // A package's root page is titled by the specifier you import it with,
  // because that string is what a reader is looking for. A subdirectory is not
  // an importable subpath, so it is titled by the folder rather than by a name
  // that would not resolve.
  const short = shortPackageName(target.packageName);
  return draft.relative === ""
    ? target.packageName
    : `${short}/${draft.relative}`;
}

function groupDescription(target: Target, draft: GroupDraft): string {
  const base = `Everything exported from \`${draft.directory}\`.`;
  if (target.kind === "app") return base;

  // Worth saying once per page: half of what a package exports is reachable and
  // half is not, and the tag beside each symbol is the only thing that says so.
  const internal = draft.symbols.some((symbol) =>
    symbol.tags.includes("internal"),
  );
  return internal
    ? `${base} Symbols tagged \`public\` are reachable through \`${target.packageName}\`; the rest are internal to the package and are listed because something in the repo already depends on them.`
    : `${base} Every symbol here is part of \`${target.packageName}\`'s published surface.`;
}

/**
 * The security page. These symbols are already on their folder's page and the
 * duplication is the point: a folder page answers "what is in here", and this
 * one answers "what can a browser call", which is not a question any folder
 * page can be read to answer.
 */
function serverActionsGroup(target: Target, actions: DocSymbol[]): DocGroup {
  return {
    path: `${target.docsProject}/reference/server-actions`,
    title: "Server Actions",
    description:
      `Every export of a \`"use server"\` file in \`${target.dir}\`. ` +
      "Each function here is an RPC entry point a browser can call directly — " +
      "no route stands in front of it, no middleware runs, and the argument " +
      "types are a suggestion rather than a check — so every one of them has " +
      "to authenticate and authorise on its own. The types listed alongside " +
      "are those functions' arguments and results.",
    // Above every folder page, because the whole reason this page exists is
    // that it is the first thing a reviewer should read.
    order: 1,
    symbols: [...actions].sort(bySymbolName),
  };
}

/**
 * Alphabetical, then by file. The tiebreak matters on the server-actions page,
 * where two folders can each export a `create`.
 */
function bySymbolName(a: DocSymbol, b: DocSymbol): number {
  return compare(a.name, b.name) || compare(a.source.file, b.source.file);
}

function coverageOf(group: DocGroup): CoverageRow {
  return {
    area: group.path,
    symbols: group.symbols.length,
    documented: group.symbols.filter((symbol) => symbol.summary !== null)
      .length,
  };
}

/* Text ------------------------------------------------------------------- */

function toPosix(file: string): string {
  return file.replace(/\\/g, "/");
}

function compare(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string): string {
  return text.length > SOURCE_TEXT_LIMIT
    ? `${text.slice(0, SOURCE_TEXT_LIMIT - 1)}…`
    : text;
}

function sourceLabel(ctx: TargetContext, node: ts.Node): string {
  const ref = sourceRefFor(ctx.repoRoot, node);
  return `${ref.file}:${ref.line}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
