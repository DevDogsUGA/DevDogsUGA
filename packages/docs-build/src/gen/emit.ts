/**
 * The one emitter. Every extractor — TypeScript, App Router, Dart — renders
 * through here, so the three produce pages a reader recognises as the same
 * kind of page.
 *
 * The output is markdown that the existing pipeline compiles like any other
 * page: frontmatter, headings that become the TOC, GFM tables. Nothing here
 * needs a renderer the site does not already have.
 */
import { closesFence, opensFence } from "../fences.js";
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

/** Four spaces at the head of a line: CommonMark's indented code block. */
const CODE_INDENT = /^ {4}/;

/**
 * One line of prose, with every `<` escaped but the ones already inside a code
 * span.
 *
 * A code span is resolved before a tag is looked for, so `<details>` between
 * backticks opens nothing, and an entity is not decoded inside one — escaping
 * there would put a literal `&lt;` on the page in place of the code the author
 * wrote. The pairing is a run of backticks closed by an equal run *on the same
 * line*, which is narrower than CommonMark, where a span may cross a newline.
 * That narrowness is the point: `prose` below only ever hands this a line the
 * extractors have already collapsed a whole paragraph onto, so a span that
 * opens here closes here, and pairing across lines would let one stray
 * backtick swallow the rest of a summary.
 */
function escapeLine(line: string): string {
  return line.replace(/(`+)[^`\n]*\1(?!`)|</g, (match) =>
    match === "<" ? "&lt;" : match,
  );
}

/**
 * Extracted text, made safe to put on a page.
 *
 * Every other line this file emits is written here and can be trusted to mean
 * what it says: the `<details>` blocks below are ours, deliberately, and the
 * site renders raw HTML — `rehype-raw` — so they work. Doc-comment prose is
 * not ours. It is whatever a contributor typed above a declaration, and a
 * sentence like "rather than a bare <details>" is an ordinary thing to type.
 * Rendered, that `<details>` opens a real disclosure widget: the paragraph
 * ends at the tag, and every heading after it is swallowed by an element
 * nothing ever closes. One such comment took the last ten of the components
 * page's fifty-five symbols off the page, and nothing about the markdown
 * looked wrong enough for anyone to catch it.
 *
 * Escaping `<` is the whole fix — nothing else opens a tag, a comment, or a
 * CDATA section — and it belongs here rather than in the four extractors
 * because here is where the text stops being data and becomes markup. An
 * extractor that escaped its own output would be guessing what the emitter
 * does with it, and every extractor written afterwards would have to remember
 * to guess the same way.
 *
 * Code is the exception, and finding it takes a line at a time, because a
 * summary does not arrive as one line. `collapseParagraphs` (gen/program.ts)
 * folds each TypeScript paragraph onto a single line, but the Dart extractor
 * says the opposite in `_prose`'s own docstring
 * (apps/study-group-finder/tool/docs_extract.dart) — "Fenced code and list
 * items are left on their own lines, because joining those is the one case
 * where healing a wrap changes what the text means" — and gen/dart.ts hands
 * that straight on as `summary: declaration.doc`. So a Dart summary reaches
 * here with real newlines in it, and Flutter samples are made of generics:
 * escape inside one of those fences and the reader is shown `&lt;Widget>`
 * where the code should be, which is the very failure this function exists to
 * prevent, one block level down.
 *
 * So the scan walks lines and hands back untouched whatever the renderer will
 * read as code:
 *
 * - A fenced block, opened and closed by `opensFence`/`closesFence`. A fence
 *   nobody closed runs to the end of the text, which is what CommonMark does
 *   with it too — so `opensFence` rather than `fences.ts`'s barer `fenceRun`
 *   is what asks the question, because the two disagree on precisely the lines
 *   `collapseParagraphs` produces. That function folds a whole TypeScript
 *   paragraph onto one line, fences included, and a fenced sample that arrives
 *   here as ``` ```ts const x = a < b; ``` ``` is a paragraph holding a code
 *   span, not a code block; reading it as a block opened means reading it as a
 *   block nobody closed, and the rest of the symbol's prose then reaches the
 *   page unescaped. `opensFence` carries the rendered proof of which reading
 *   the site takes.
 * - A run of lines indented four spaces. That is the same fence seen from
 *   further in: a dartdoc fence written two list levels deep arrives here at
 *   exactly four spaces (`///` and its one conventional space come off, the
 *   markdown indent does not), and both readings of such a run — an indented
 *   code block, or a fence inside the list item — are code, so leaving it
 *   alone is right under either. Nothing else can be indented that far.
 *   Outside a fence both extractors trim what they emit, so the only leading
 *   whitespace that survives extraction is whitespace from inside one.
 * - A code span, by `escapeLine`.
 *
 * Everything else is escaped, which is the direction to be wrong in: a
 * needless escape shows one reader a `&lt;` where a `<` belonged, and a missed
 * tag takes the rest of the page away from all of them. The angle-bracket
 * autolink is what pays for that. `<https://example.com>` in a doc comment
 * reaches the page as `&lt;https://example.com>`, and what the reader gets —
 * rendered through the site's own plugins — is a literal `<` followed by
 * `remark-gfm`'s bare-URL rule linking the rest of it, closing bracket
 * included, so the href ends in `%3E`. The alternative is teaching this
 * function CommonMark's autolink grammar to save a form of link that a bare
 * URL and a `[text](url)` both already give, neither of which has a `<` in it
 * for this function to touch.
 */
function prose(text: string): string {
  const out: string[] = [];
  /** The fence run that opened the code block we are inside, if we are. */
  let fence: string | null = null;
  /** Whether an indented code block is still running. */
  let indented = false;
  /** Whether a block could begin on this line — the text starts one, a blank line starts one. */
  let opening = true;

  for (const line of text.split("\n")) {
    const blank = line.trim() === "";

    if (fence !== null) {
      out.push(line);
      if (closesFence(line, fence)) fence = null;
      opening = false;
      continue;
    }

    // An indented block runs through blank lines and ends at the first line
    // that has content and less than four spaces of indent.
    if (indented && (blank || CODE_INDENT.test(line))) {
      out.push(line);
      opening = blank;
      continue;
    }
    indented = false;

    const run = opensFence(line);
    if (run !== null) {
      fence = run;
      out.push(line);
      opening = false;
      continue;
    }

    if (opening && CODE_INDENT.test(line)) {
      indented = true;
      out.push(line);
      opening = false;
      continue;
    }

    out.push(escapeLine(line));
    opening = blank;
  }

  return out.join("\n");
}

/**
 * The same text for a table cell, where there is no block level to find code
 * at.
 *
 * `cell` puts the whole description on one line, because a newline inside a
 * GFM row ends the row — so a fence in a parameter's doc comment does not
 * survive as a fence no matter what this does, and reasoning about the lines
 * it had before the flattening would be reasoning about text the reader never
 * sees. What the reader sees is one line, so one line is what gets escaped:
 * flattened backtick runs that still pair by `escapeLine`'s rule are a code
 * span and are left alone, and everything else is escaped.
 *
 * That rule is narrower than CommonMark's in one direction, and the emitter
 * tests measure both sides of the gap. A flattening that leaves a run with no
 * partner at all — the closing delimiter never reached the description — is
 * markup under CommonMark too, and a `<Widget>` in such a cell renders as a
 * real `<widget>` element opened inside the table; escaping is the only thing
 * that stops it. A flattening whose runs still pair, but with a stray backtick
 * between them, is a code span to CommonMark and inert, while `escapeLine`
 * cannot match across that backtick and escapes anyway — costing the reader a
 * literal `&lt;` inside a sample. Paying that to keep the first case off the
 * page is the trade this function makes deliberately.
 */
function proseCell(text: string): string {
  return escapeLine(cell(text));
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
 *
 * A GitHub alert rather than a bare blockquote. Every hand-written aside in
 * the corpus is one of these, so a plain `>` was the only quote-shaped thing
 * on the site that rendered as an unstyled rule-and-indent — it read as
 * something the author had quoted rather than as the page telling you what it
 * is.
 *
 * NOTE, not WARNING or CAUTION, even though the sentence is about losing work.
 * This banner is on all hundred-odd generated pages, and a red or amber bar at
 * the top of every one of them is a thing readers learn to look past within a
 * day — at which point the loud styling has cost the warning its audience. Its
 * first job is to say what kind of page this is; the instruction follows from
 * that.
 */
function generatedNotice(sourceHint: string): string {
  return [
    "> [!NOTE]",
    `> **Generated** from ${sourceHint} by \`docs-build gen\`. Edits to this page are overwritten on the next build — change the doc comments in the source instead.`,
  ].join("\n");
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
      row.push(param.description === null ? "—" : proseCell(param.description));
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
    out.push(prose(symbol.summary));
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
        : // A title is `export const metadata`'s, so it is prose a contributor
          // wrote as surely as a doc comment is, and it lands in the cell as
          // itself — no backticks, no link around it. A parameter's
          // description is the only other cell on a generated page that does,
          // and it goes through the same `proseCell` for the same reason.
          route.title === null
          ? "—"
          : proseCell(route.title),
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
