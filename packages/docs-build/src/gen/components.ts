/**
 * The component extractor: every React component under a target's `components`
 * and `ui` directories, grouped one page per directory.
 *
 * Whether something is a component is decided syntactically: a PascalCase name,
 * a `.tsx` file, a type the checker says is callable, rather than hunting for a
 * JSX return. `memo(forwardRef(...))` buries that return two calls deep, and
 * the two tests disagree about nothing in this repository, so the cheap one is
 * also the one that cannot get it wrong.
 *
 * Props are the opposite: resolved through the checker, never read off the
 * source. `ComponentProps<"button"> & VariantProps<typeof variants>` is the
 * ordinary declaration here, and reprinting it verbatim would document nothing
 * a reader could not already see in the file.
 *
 * That resolution is also why the table is not everything the checker returns.
 * A shadcn wrapper spreading `ComponentProps<"div">` resolves to some three
 * hundred props, of which two are its own, so props are split by where each one
 * is declared: in this repository it is listed, under `node_modules` it is
 * counted.
 */
import * as ts from "typescript";
import type {
  CoverageRow,
  DocGroup,
  DocSymbol,
  ExtractResult,
  InheritedProps,
  ParamDoc,
  SymbolTag,
} from "./model.js";
import type { ExportedSymbol, Target, TargetContext } from "./program.js";
import {
  exportsOf,
  fileDirectives,
  importPathFor,
  isDeprecated,
  jsDocParams,
  jsDocSummary,
  repoRelative,
  sourceFilesFor,
  sourceRefFor,
  typeToString,
} from "./program.js";

/**
 * Where components live. A `.tsx` outside these two directories is a route, a
 * provider or a page section, and belongs to another extractor's pages.
 */
const COMPONENT_DIRECTORIES = ["components", "ui"];

/**
 * A backstop rather than the mechanism. Inherited props no longer reach the
 * table, so a component has to declare forty of its own to hit this. That would
 * be a real anomaly, so it warns instead of truncating in silence: a truncated
 * table a reader trusts is worse than no table at all.
 */
const MAX_OWN_PROPS = 40;

/**
 * How many packages the inherited line names. Three is enough to tell a reader
 * where to go looking, and nothing marks the truncation: the count standing
 * beside the names is already the whole claim.
 */
const MAX_INHERITED_SOURCES = 3;

/** A description is a table cell, and React's own prop docs run to paragraphs. */
const DESCRIPTION_LIMIT = 200;

/** Past this, a written type stops being a signature and becomes the page. */
const SIGNATURE_TYPE_LIMIT = 200;

/** Components sort after the written pages, which start their order at 0. */
const ORDER_BASE = 100;

/** A group under construction, before it knows its own sort position. */
interface GroupDraft {
  path: string;
  /** Repo-relative source directories feeding the group. Normally exactly one. */
  directories: Set<string>;
  symbols: DocSymbol[];
}

export function extractComponents(ctx: TargetContext): ExtractResult {
  const warnings: string[] = [];
  const drafts = new Map<string, GroupDraft>();

  for (const file of sourceFilesFor(ctx.target)) {
    if (!file.endsWith(".tsx")) continue;
    if (!isComponentFile(ctx.target, file)) continue;

    const sourceFile = ctx.program.getSourceFile(file);
    if (sourceFile === undefined) {
      warnings.push(
        `${repoRelative(ctx.repoRoot, file)}: the program did not load this file, so its components are missing.`,
      );
      continue;
    }

    const symbols = componentsIn(ctx, sourceFile, warnings);
    if (symbols.length === 0) continue;

    const path = groupPathFor(ctx.target, file);
    const draft = drafts.get(path) ?? {
      path,
      directories: new Set<string>(),
      symbols: [],
    };
    draft.directories.add(repoRelative(ctx.repoRoot, directoryOf(file)));
    draft.symbols.push(...symbols);
    drafts.set(path, draft);
  }

  const ordered = [...drafts.values()].sort((a, b) =>
    compareStrings(a.path, b.path),
  );
  for (const draft of ordered) warnDuplicateNames(draft, warnings);

  const groups: DocGroup[] = ordered.map((draft, index) => ({
    path: draft.path,
    title: titleFor(draft.path.split("/").at(-1) ?? ""),
    description: describeGroup(draft),
    order: ORDER_BASE + index,
    symbols: draft.symbols,
  }));

  const coverage: CoverageRow[] = ordered.map((draft) => ({
    area: sortedDirectories(draft).join(", "),
    symbols: draft.symbols.length,
    documented: draft.symbols.filter((symbol) => symbol.summary !== null)
      .length,
  }));

  return { groups, routes: [], coverage, warnings };
}

/* Symbols ---------------------------------------------------------------- */

function componentsIn(
  ctx: TargetContext,
  sourceFile: ts.SourceFile,
  warnings: string[],
): DocSymbol[] {
  const directives = fileDirectives(sourceFile);
  // Keyed by the declaration's position, because a file that both names and
  // default-exports one declaration must not print it twice.
  const found = new Map<number, DocSymbol>();

  for (const exported of exportsOf(ctx.program, sourceFile)) {
    if (!isPascalCase(exported.name)) continue;

    const value = valueNodeOf(exported.declaration);
    if (value === null) continue;

    const [signature] = ctx.checker
      .getTypeAtLocation(value)
      .getCallSignatures();
    if (signature === undefined) continue;

    const position = exported.declaration.getStart(sourceFile);
    const existing = found.get(position);
    if (existing !== undefined) {
      // The same declaration reached through two exports. How you import it is
      // the only thing that differs, and the default is the way it reads.
      if (exported.isDefault && !existing.tags.includes("default export")) {
        existing.importStyle = "default";
        existing.tags.unshift("default export");
      }
      continue;
    }

    found.set(
      position,
      describeComponent(ctx, exported, signature, directives, warnings),
    );
  }

  return [...found.values()];
}

function describeComponent(
  ctx: TargetContext,
  exported: ExportedSymbol,
  signature: ts.Signature,
  directives: { useClient: boolean; useServer: boolean },
  warnings: string[],
): DocSymbol {
  const declaration = exported.declaration;
  const functionLike = functionLikeOf(declaration);

  const file = declaration.getSourceFile().fileName;

  const tags: SymbolTag[] = [];
  if (exported.isDefault) tags.push("default export");
  if (directives.useClient) tags.push("client");
  if (isDeprecated(declaration)) tags.push("deprecated");
  // A package's `exports` map is the public/private line it already drew, and
  // the emitter reads `internal` to decide whether an import line would even
  // resolve. Apps declare no `exports`, so neither tag applies to them.
  if (ctx.target.kind === "package") {
    tags.push(ctx.target.publicEntries.has(file) ? "public" : "internal");
  }

  const props = propsOf(ctx, exported, signature, functionLike, warnings);

  return {
    name: exported.name,
    kind: "component",
    importPath: importPathFor(ctx.target, file),
    importStyle: exported.isDefault ? "default" : "named",
    summary: jsDocSummary(declaration),
    signature: signatureText(
      ctx,
      exported.name,
      signature,
      functionLike,
      declaration,
    ),
    params: props.own,
    // A wrapper that declares nothing of its own gets the inherited line and
    // no table, which is the honest rendering: there is nothing to tabulate.
    paramsLabel: props.own.length > 0 ? "Prop" : null,
    // A component returns an element. Repeating that under all 161 of them is
    // a line a reader learns to skip, which costs the lines beside it too.
    returns: null,
    shape: null,
    tags,
    source: sourceRefFor(ctx.repoRoot, declaration),
    inherited: props.inherited,
  };
}

/** The two halves of a component's props: what it declares, and what arrived. */
interface ResolvedProps {
  /** Declared in this repository. These are the table. */
  own: ParamDoc[];
  /** Declared in a dependency. Counted and attributed, never listed. */
  inherited: InheritedProps | null;
}

/**
 * The props, split. Every property comes from the checker's view of the first
 * parameter, so an intersection of `ComponentProps<typeof Slot>` and a local
 * object type arrives here already flattened. The component's own props and the
 * two hundred DOM attributes that came in with the spread sit side by side, and
 * no name tells them apart.
 *
 * Where each one is declared is the only thing that does. A property whose
 * declaration sits under `node_modules` came in with a spread, and anything
 * else was written in this repository.
 */
function propsOf(
  ctx: TargetContext,
  exported: ExportedSymbol,
  signature: ts.Signature,
  functionLike: ts.SignatureDeclaration | null,
  warnings: string[],
): ResolvedProps {
  const declaration = exported.declaration;
  const [parameter] = signature.getParameters();
  if (parameter === undefined) return { own: [], inherited: null };

  const { checker } = ctx;
  const properties = checker.getPropertiesOfType(
    checker.getApparentType(
      checker.getTypeOfSymbolAtLocation(parameter, declaration),
    ),
  );
  if (properties.length === 0) return { own: [], inherited: null };

  const defaults = destructuringDefaults(functionLike);
  const documented = documentedParams(declaration, functionLike);
  const parameterName = firstParameterName(functionLike);

  const own: ParamDoc[] = [];
  const sources = new Set<string>();
  let inheritedCount = 0;

  for (const property of properties) {
    const dependency = declaringPackage(property);
    if (dependency !== null) {
      inheritedCount += 1;
      sources.add(dependency);
      continue;
    }

    const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
    const printed = typeToString(
      checker,
      checker.getTypeOfSymbolAtLocation(property, declaration),
      declaration,
    );
    own.push({
      name: property.getName(),
      type: optional ? withoutUndefined(printed) : printed,
      required: !optional,
      default: defaults.get(property.getName()) ?? null,
      description: describeProp(property, documented, parameterName),
    });
  }

  // Required first: they are the ones a reader has to act on, and the rest is
  // a reference they scan alphabetically.
  own.sort((a, b) =>
    a.required === b.required
      ? compareStrings(a.name, b.name)
      : a.required
        ? -1
        : 1,
  );

  const inherited: InheritedProps | null =
    inheritedCount === 0
      ? null
      : {
          count: inheritedCount,
          sources: [...sources]
            .sort(compareStrings)
            .slice(0, MAX_INHERITED_SOURCES),
        };

  // Only own props can overflow, and only own props are worth warning about.
  // Three hundred inherited props is what a `div` wrapper is rather than an
  // anomaly, and warning about it teaches a reader to ignore the warnings.
  if (own.length <= MAX_OWN_PROPS) return { own, inherited };

  warnings.push(
    `${repoRelative(ctx.repoRoot, declaration.getSourceFile().fileName)}: ${exported.name} declares ${own.length} props of its own; the table lists the first ${MAX_OWN_PROPS}.`,
  );
  return { own: own.slice(0, MAX_OWN_PROPS), inherited };
}

/**
 * The dependency a prop was declared in, or null when it was declared here.
 * The first declaration's file is the whole test. No name patterns, no list of
 * known DOM attributes, nothing to maintain as React's typings change.
 */
function declaringPackage(property: ts.Symbol): string | null {
  const [declaration] = property.getDeclarations() ?? [];
  // A property the checker synthesised with nothing to point at cannot be
  // shown to come from a dependency, so it stays in the table. Of the two
  // available mistakes, listing one prop too many is the recoverable one.
  if (declaration === undefined) return null;
  return packageOf(declaration.getSourceFile().fileName);
}

/**
 * The npm package a path belongs to, or null for a file in this repository.
 * pnpm stores the real package under a second `node_modules`, so the last one
 * is the one that names it:
 * `…/.pnpm/@types+react@19.2.18/node_modules/@types/react/index.d.ts` →
 * `@types/react`.
 */
function packageOf(absFile: string): string | null {
  const path = absFile.replace(/\\/g, "/");
  const marker = "/node_modules/";
  const at = path.lastIndexOf(marker);
  if (at === -1) return null;

  const [first, second] = path.slice(at + marker.length).split("/");
  if (first === undefined || first === "") return null;
  // A scoped package is two segments; everything else is one.
  return first.startsWith("@") && second !== undefined
    ? `${first}/${second}`
    : first;
}

/**
 * A prop's own doc comment, or the component's `@param` tag for it.
 * Destructured parameters are documented as `@param props.variant` about as
 * often as `@param variant`, so both spellings are looked up.
 */
function describeProp(
  property: ts.Symbol,
  documented: Map<string, string>,
  parameterName: string,
): string | null {
  const [own] = property.getDeclarations() ?? [];
  const summary = own === undefined ? null : jsDocSummary(own);
  const name = property.getName();

  return trimDescription(
    summary ??
      documented.get(name) ??
      documented.get(`${parameterName}.${name}`) ??
      documented.get(`props.${name}`) ??
      null,
  );
}

/**
 * The signature as one line: `function Button(props: ButtonProps): Element`.
 * The parameter's annotation wins over the resolved type. Resolution belongs in
 * the props table below, not on this line, where `ComponentProps<"button">`
 * would expand into the two hundred DOM attributes a reader came here to
 * avoid.
 */
function signatureText(
  ctx: TargetContext,
  name: string,
  signature: ts.Signature,
  functionLike: ts.SignatureDeclaration | null,
  declaration: ts.Declaration,
): string {
  const enclosing = functionLike ?? declaration;

  const parameters = signature.getParameters().map((parameter, index) => {
    const declared = functionLike?.parameters[index];
    const label =
      declared !== undefined && ts.isIdentifier(declared.name)
        ? declared.name.text
        : index === 0
          ? "props"
          : `arg${index + 1}`;
    const optional = (parameter.flags & ts.SymbolFlags.Optional) !== 0;
    const written =
      declared?.type === undefined ? null : collapse(declared.type.getText());
    const type =
      written !== null && written.length <= SIGNATURE_TYPE_LIMIT
        ? written
        : typeToString(
            ctx.checker,
            ctx.checker.getTypeOfSymbolAtLocation(
              parameter,
              declared ?? enclosing,
            ),
            enclosing,
          );
    return `${label}${optional ? "?" : ""}: ${type}`;
  });

  const returns = typeToString(
    ctx.checker,
    signature.getReturnType(),
    enclosing,
  );
  return withoutImportQualifiers(
    `function ${name}(${parameters.join(", ")}): ${returns}`,
  );
}

/**
 * `import("react").JSX.Element` is how the checker spells a type whose symbol
 * is not in scope where the component is declared. That is a fact about the
 * checker, not about the component, and the import line printed directly above
 * this one already says where the component comes from. Only the `import("…").`
 * prefix goes. The type name after it is left exactly as the checker wrote it,
 * so `JSX.Element` still says what it said.
 */
function withoutImportQualifiers(signature: string): string {
  return signature.replace(/import\((?:"[^"]*"|'[^']*')\)\./g, "");
}

/* Declarations ----------------------------------------------------------- */

/**
 * The node whose type answers "is this callable". A component is written as a
 * function, as a `const` holding an arrow, or as a `const` holding the result
 * of `forwardRef`/`memo`. Only the checker can tell the third from a `const`
 * holding an object of components, which this repository also has.
 */
function valueNodeOf(declaration: ts.Declaration): ts.Node | null {
  if (ts.isFunctionDeclaration(declaration)) {
    return declaration.name ?? declaration;
  }
  if (
    ts.isVariableDeclaration(declaration) ||
    ts.isBindingElement(declaration)
  ) {
    return ts.isIdentifier(declaration.name) ? declaration.name : null;
  }
  if (ts.isExportAssignment(declaration)) return declaration.expression;
  // A class component would be documented from its `render`, and this codebase
  // has none; supporting one would be a claim nothing checks.
  return null;
}

/**
 * The function the parameters are actually written on. Defaults and `@param`
 * tags live there and nowhere else, and `memo(forwardRef(function Card() {}))`
 * puts it two calls below the declaration.
 */
function functionLikeOf(
  declaration: ts.Declaration,
): ts.SignatureDeclaration | null {
  if (ts.isFunctionDeclaration(declaration)) return declaration;

  const expression = ts.isExportAssignment(declaration)
    ? declaration.expression
    : ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration)
      ? declaration.initializer
      : undefined;

  return expression === undefined ? null : unwrapFunction(expression, 0);
}

function unwrapFunction(
  expression: ts.Expression,
  depth: number,
): ts.SignatureDeclaration | null {
  // `memo(forwardRef(...))` is two levels; anything deeper is a wrapper this
  // generator has no business guessing about.
  if (depth > 4) return null;

  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return expression;
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapFunction(expression.expression, depth + 1);
  }
  if (ts.isCallExpression(expression)) {
    for (const argument of expression.arguments) {
      const found = unwrapFunction(argument, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

/** `{ size = "default" }` → `size` → `"default"`, as written. */
function destructuringDefaults(
  functionLike: ts.SignatureDeclaration | null,
): Map<string, string> {
  const defaults = new Map<string, string>();
  const parameter = functionLike?.parameters[0];
  if (parameter === undefined || !ts.isObjectBindingPattern(parameter.name)) {
    return defaults;
  }

  for (const element of parameter.name.elements) {
    if (element.initializer === undefined) continue;
    const key = element.propertyName ?? element.name;
    const name = ts.isIdentifier(key)
      ? key.text
      : ts.isStringLiteral(key)
        ? key.text
        : null;
    if (name === null) continue;
    defaults.set(name, collapse(element.initializer.getText()));
  }

  return defaults;
}

/** `@param` tags from the declaration and from the function under it. */
function documentedParams(
  declaration: ts.Declaration,
  functionLike: ts.SignatureDeclaration | null,
): Map<string, string> {
  const documented = jsDocParams(declaration);
  if (functionLike === null || functionLike === declaration) return documented;

  for (const [name, description] of jsDocParams(functionLike)) {
    if (!documented.has(name)) documented.set(name, description);
  }
  return documented;
}

/** What `@param props.variant` would be spelled as for this component. */
function firstParameterName(
  functionLike: ts.SignatureDeclaration | null,
): string {
  const parameter = functionLike?.parameters[0];
  return parameter !== undefined && ts.isIdentifier(parameter.name)
    ? parameter.name.text
    : "props";
}

/* Grouping --------------------------------------------------------------- */

function isComponentFile(target: Target, absFile: string): boolean {
  return COMPONENT_DIRECTORIES.some((name) =>
    absFile.startsWith(`${target.srcDir}/${name}/`),
  );
}

/**
 * One page per directory, under a `components/` folder that mirrors the import
 * path. `src/ui` keeps its name because `~/ui/button` is what a reader types;
 * `src/components` does not, because the folder it lands in already says it.
 */
function groupPathFor(target: Target, absFile: string): string {
  const relative = directoryOf(absFile).slice(target.srcDir.length + 1);
  const segments = relative.split("/").filter((segment) => segment !== "");
  if (segments[0] === "components") segments.shift();
  const suffix = segments.length === 0 ? "index" : segments.join("/");
  return `${target.docsProject}/reference/components/${suffix}`;
}

/** `ui` → `UI`, `saved-plans` → `Saved Plans`, `LeaderCluster` unchanged. */
function titleFor(segment: string): string {
  // Files directly in `src/components` land at `.../components/index`, and
  // nobody is looking for a page called "Index".
  if (segment === "index") return "Components";

  const title = segment
    .split(/[-_\s]+/)
    .filter((word) => word !== "")
    .map((word) =>
      word.toLowerCase() === "ui"
        ? "UI"
        : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
  return title === "" ? "Components" : title;
}

/**
 * Two components of the same name in one directory become two `### Button`
 * sections on one page, with the second reachable only by a `#button-1`
 * anchor. The page is not wrong, but it reads like a bug in the generator
 * rather than a collision in the source, so it is worth saying out loud.
 */
function warnDuplicateNames(draft: GroupDraft, warnings: string[]): void {
  const seen = new Set<string>();
  for (const symbol of draft.symbols) {
    if (seen.has(symbol.name)) {
      warnings.push(
        `${draft.path}: two components are called ${symbol.name}; the second is ${symbol.source.file}.`,
      );
    }
    seen.add(symbol.name);
  }
}

function describeGroup(draft: GroupDraft): string {
  const count = draft.symbols.length;
  const noun = count === 1 ? "component" : "components";
  return `${count} ${noun} in ${sortedDirectories(draft).join(" and ")}.`;
}

function sortedDirectories(draft: GroupDraft): string[] {
  return [...draft.directories].sort(compareStrings);
}

/* Text ------------------------------------------------------------------- */

/**
 * React enforces PascalCase at the call site, where a lowercase name is a DOM
 * tag. Here it is a rule of the language rather than a naming convention.
 */
function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/**
 * The `Required` column already says a prop is optional. Carrying
 * `| undefined` through every row of every table repeats it thousands of times.
 */
function withoutUndefined(type: string): string {
  return type.replace(/^undefined \| /, "").replace(/ \| undefined$/, "");
}

function trimDescription(text: string | null): string | null {
  if (text === null) return null;
  const collapsed = collapse(text);
  if (collapsed === "") return null;
  return collapsed.length > DESCRIPTION_LIMIT
    ? `${collapsed.slice(0, DESCRIPTION_LIMIT - 1)}…`
    : collapsed;
}

/** Source text is wrapped and indented; a table cell and a signature are not. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function directoryOf(absFile: string): string {
  const at = absFile.lastIndexOf("/");
  return at === -1 ? absFile : absFile.slice(0, at);
}

/** `Array.prototype.sort`'s default coerces; this states the comparison. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
