/**
 * The one emitter. Every extractor — TypeScript, App Router, Dart — renders
 * through here, so the three produce pages a reader recognises as the same
 * kind of page.
 *
 * The output is markdown that the existing pipeline compiles like any other
 * page: frontmatter, headings that become the TOC, GFM tables. Nothing here
 * needs a renderer the site does not already have.
 */
import type {
  DocGroup,
  DocSymbol,
  ParamDoc,
  RouteEntry,
  SourceRef,
  SymbolKind,
} from "./model.js";

/** Where "view source" points. */
export interface EmitOptions {
  /** Repo URL up to and including the branch, no trailing slash. */
  sourceBaseUrl: string;
}

/**
 * Past this many characters a resolved type stops being readable in a table
 * cell. The checker prints unions and generics in full, and a few of them run
 * to several hundred characters.
 */
const TYPE_INLINE_LIMIT = 96;

const KIND_SECTIONS: { kind: SymbolKind; heading: string }[] = [
  { kind: "component", heading: "Components" },
  { kind: "widget", heading: "Widgets" },
  { kind: "hook", heading: "Hooks" },
  { kind: "function", heading: "Functions" },
  { kind: "class", heading: "Classes" },
  { kind: "enum", heading: "Enums" },
  { kind: "extension", heading: "Extensions" },
  { kind: "constant", heading: "Constants" },
  { kind: "type", heading: "Types" },
];

/** GFM reads an unescaped `|` as a cell boundary, and union types are full of them. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

/** Backticked, with the pipe escaping a table cell needs. */
function code(text: string): string {
  return `\`${cell(text)}\``;
}

function frontmatter(
  fields: Record<string, string | number | boolean>,
): string {
  const lines = Object.entries(fields).map(([key, value]) =>
    typeof value === "string" ? `${key}: ${quote(value)}` : `${key}: ${value}`,
  );
  return `---\n${lines.join("\n")}\n---\n`;
}

/** YAML-safe scalar. Double quotes, since descriptions contain apostrophes. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The line that makes a generated page legible as one. A reader who cannot
 * tell which pages are written will not trust either kind.
 */
function generatedNotice(sourceHint: string): string {
  return `> **Generated** from ${sourceHint} by \`docs-build gen\`. Edits to this page are overwritten on the next build — change the doc comments in the source instead.`;
}

function sourceLink(ref: SourceRef, options: EmitOptions): string {
  return `${options.sourceBaseUrl}/${ref.file}#L${ref.line}`;
}

/**
 * How you reach the symbol. An internal package symbol has no import line worth
 * printing — it is not reachable through the package's `exports` map — so it
 * gets its source path instead. Printing an import that does not resolve is how
 * a generator starts lying.
 */
function importLine(symbol: DocSymbol): string {
  if (symbol.tags.includes("internal")) {
    return `// ${symbol.importPath} — internal to the package, not exported`;
  }
  // Dart imports a library, not a binding, and the quoting convention differs.
  if (symbol.language === "dart") {
    return `import '${symbol.importPath}';`;
  }
  const clause =
    symbol.importStyle === "default" ? symbol.name : `{ ${symbol.name} }`;
  return `import ${clause} from "${symbol.importPath}";`;
}

function tagLine(symbol: DocSymbol): string | null {
  if (symbol.tags.length === 0) return null;
  return symbol.tags.map((tag) => `\`${tag}\``).join(" · ");
}

/**
 * A params table, plus — only when the checker's types are too wide to read in
 * a cell — a collapsible holding them in full. That is the one thing a
 * collapsible is for: the detail is there when it is wanted and out of the way
 * when it is not.
 */
function paramsTable(
  params: ParamDoc[],
  label: "Prop" | "Parameter",
): string[] {
  const out: string[] = [];
  const wide = params.filter((p) => p.type.length > TYPE_INLINE_LIMIT);

  const hasDefaults = params.some((p) => p.default !== null);
  const hasDescriptions = params.some((p) => p.description !== null);

  const header = [label, "Type", "Required"];
  if (hasDefaults) header.push("Default");
  if (hasDescriptions) header.push("Description");

  out.push(`| ${header.join(" | ")} |`);
  out.push(`| ${header.map(() => "---").join(" | ")} |`);

  for (const param of params) {
    const type =
      param.type.length > TYPE_INLINE_LIMIT
        ? code(`${param.type.slice(0, TYPE_INLINE_LIMIT - 1)}…`)
        : code(param.type);
    const row = [code(param.name), type, param.required ? "yes" : "no"];
    if (hasDefaults)
      row.push(param.default === null ? "—" : code(param.default));
    if (hasDescriptions) {
      row.push(param.description === null ? "—" : cell(param.description));
    }
    out.push(`| ${row.join(" | ")} |`);
  }

  if (wide.length > 0) {
    out.push("");
    out.push("<details>");
    out.push(
      `<summary>Full ${wide.length === 1 ? "type" : "types"} for ${wide
        .map((p) => `<code>${p.name}</code>`)
        .join(", ")}</summary>`,
    );
    out.push("");
    out.push("```typescript");
    for (const param of wide) out.push(`${param.name}: ${param.type}`);
    out.push("```");
    out.push("");
    out.push("</details>");
  }

  return out;
}

/**
 * Which language a symbol's code fence is tagged with. The site registers a
 * fixed list of languages and silently falls back to plain text for anything
 * else, so a wrong tag costs the highlighting without saying so.
 */
function fenceLanguage(symbol: DocSymbol): string {
  return symbol.language ?? "typescript";
}

/**
 * The one line that stands in for a few hundred inherited props. Named rather
 * than listed: which library they come from is the part a reader can act on.
 */
function inheritedLine(symbol: DocSymbol): string | null {
  const inherited = symbol.inherited;
  if (!inherited || inherited.count === 0) return null;
  const sources = inherited.sources.map((s) => `\`${s}\``).join(", ");
  const props = inherited.count === 1 ? "prop" : "props";
  return sources
    ? `Plus ${inherited.count} inherited ${props} from ${sources}.`
    : `Plus ${inherited.count} inherited ${props}.`;
}

/** One symbol, as a `###` section. */
export function renderSymbol(symbol: DocSymbol, options: EmitOptions): string {
  const out: string[] = [];

  out.push(`### \`${symbol.name}\``);
  out.push("");

  const tags = tagLine(symbol);
  if (tags) {
    out.push(tags);
    out.push("");
  }

  if (symbol.summary) {
    out.push(symbol.summary);
    out.push("");
  }

  out.push(`\`\`\`${fenceLanguage(symbol)}`);
  out.push(importLine(symbol));
  if (symbol.signature) out.push(symbol.signature);
  if (symbol.shape) out.push(symbol.shape);
  out.push("```");
  out.push("");

  if (symbol.params.length > 0 && symbol.paramsLabel) {
    out.push(...paramsTable(symbol.params, symbol.paramsLabel));
    out.push("");
  }

  const inherited = inheritedLine(symbol);
  if (inherited) {
    out.push(inherited);
    out.push("");
  }

  if (symbol.returns) {
    out.push(`**Returns** ${code(symbol.returns)}`);
    out.push("");
  }

  out.push(
    `[\`${symbol.source.file}\`](${sourceLink(symbol.source, options)})`,
  );
  out.push("");

  return out.join("\n");
}

/**
 * One group as a full page. Kind headings appear only when a page holds more
 * than one kind — a `## Components` heading above nothing but components is
 * noise in the table of contents.
 */
export function renderGroupPage(group: DocGroup, options: EmitOptions): string {
  const kinds = new Set(group.symbols.map((s) => s.kind));
  const sectioned = kinds.size > 1;

  const out: string[] = [];
  out.push(
    frontmatter({
      name: group.title,
      description: group.description,
      order: group.order,
      generated: true,
    }),
  );
  out.push(`# ${group.title}`);
  out.push("");
  out.push(generatedNotice("source"));
  out.push("");
  out.push(group.description);
  out.push("");

  for (const section of KIND_SECTIONS) {
    const symbols = group.symbols.filter((s) => s.kind === section.kind);
    if (symbols.length === 0) continue;
    if (sectioned) {
      out.push(`## ${section.heading}`);
      out.push("");
    }
    for (const symbol of symbols) out.push(renderSymbol(symbol, options));
  }

  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

/**
 * The route table. The App Router's directory *is* the enumeration, and it is
 * the part no written page keeps current.
 */
export function renderRoutesPage(
  routes: RouteEntry[],
  meta: { title: string; description: string; order: number; isApi: boolean },
  options: EmitOptions,
): string {
  const out: string[] = [];
  out.push(
    frontmatter({
      name: meta.title,
      description: meta.description,
      order: meta.order,
      generated: true,
    }),
  );
  out.push(`# ${meta.title}`);
  out.push("");
  out.push(generatedNotice("the App Router directory tree"));
  out.push("");
  out.push(meta.description);
  out.push("");

  const anyConfig = routes.some((r) => Object.keys(r.config).length > 0);
  const header = meta.isApi
    ? ["Route", "Methods", "File"]
    : ["Route", "Title", "File"];
  if (anyConfig) header.push("Segment config");

  out.push(`| ${header.join(" | ")} |`);
  out.push(`| ${header.map(() => "---").join(" | ")} |`);

  for (const route of routes) {
    const file = route.files.route ?? route.files.page ?? route.source.file;
    const row = [
      code(route.url),
      meta.isApi
        ? route.methods.map((m) => `\`${m}\``).join(" ") || "—"
        : (route.title ?? "—"),
      `[\`${shortPath(file)}\`](${sourceLink({ file, line: 1 }, options)})`,
    ];
    if (anyConfig) {
      const config = Object.entries(route.config)
        .map(([key, value]) => `\`${key} = ${value}\``)
        .join(" ");
      row.push(config || "—");
    }
    out.push(`| ${row.join(" | ")} |`);
  }

  out.push("");
  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

/** `apps/platform/src/app/(site)/page.tsx` → `(site)/page.tsx`. */
function shortPath(file: string): string {
  const marker = "/src/app/";
  const at = file.indexOf(marker);
  return at === -1 ? file : file.slice(at + marker.length);
}
