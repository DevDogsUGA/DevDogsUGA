import type { List, PhrasingContent, Root, RootContent, Table } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  indent,
  MEASURE,
  span,
  textWidth,
  truncate,
  wrap,
  type Line,
  type Span,
  type Style,
} from "./doc";
import { TONE } from "./theme";

/**
 * Authored markdown (competition briefs, support answers) drawn with the
 * kit's own primitives, so a brief's headings look like every other
 * `## heading` in the terminal rather than like whatever the author typed.
 *
 * Deliberately smaller than `DocsMarkdown`: GFM structure, links printed with
 * their URLs (a terminal can't follow an anchor), and code blocks verbatim.
 * No syntax highlighting, no maths, no raw HTML. Anything this can't draw is
 * the reason the page also prints its browser URL.
 */
const parser = unified().use(remarkParse).use(remarkGfm);

export function markdownLines(source: string, accent: string): Line[] {
  const tree = parser.runSync(parser.parse(source)) as Root;
  return blocks(tree.children, MEASURE, accent);
}

function blocks(
  nodes: readonly RootContent[],
  width: number,
  accent: string,
): Line[] {
  const out: Line[] = [];
  for (const node of nodes) {
    const lines = block(node, width, accent);
    if (lines.length === 0) continue;
    if (out.length > 0) out.push([]);
    out.push(...lines);
  }
  return out;
}

/**
 * One block node. If-chained rather than a switch: mdast's union is open-ended
 * (directives, maths, footnotes) and everything not drawn here falls through
 * to its children, or to nothing.
 */
function block(node: RootContent, width: number, accent: string): Line[] {
  if (node.type === "heading") {
    return wrap(
      [
        span(`${"#".repeat(Math.max(2, node.depth))} `, {
          fg: accent,
          bold: true,
        }),
        ...inline(node.children, { fg: accent, bold: true }),
      ],
      width,
    );
  }
  if (node.type === "paragraph") {
    return wrap(inline(node.children, { fg: TONE.mute }), width);
  }
  if (node.type === "list") return list(node, width, accent);
  if (node.type === "blockquote") {
    return indent(blocks(node.children, width - 2, accent), [
      span("│ ", { fg: TONE.dim }),
    ]);
  }
  if (node.type === "code") {
    return node.value
      .split("\n")
      .map((text) => [
        span("│ ", { fg: TONE.dim }),
        span(truncate(text, width - 2), { fg: TONE.ink }),
      ]);
  }
  if (node.type === "thematicBreak") {
    return [[span("─".repeat(width), { fg: TONE.rule })]];
  }
  if (node.type === "table") return table(node, width);
  if (
    node.type === "html" ||
    node.type === "definition" ||
    node.type === "yaml"
  ) {
    return [];
  }
  return "children" in node ? blocks(node.children, width, accent) : [];
}

function list(node: List, width: number, accent: string): Line[] {
  const out: Line[] = [];
  node.children.forEach((item, i) => {
    const marker = node.ordered
      ? `${(node.start ?? 1) + i}. `
      : item.checked === true
        ? "[x] "
        : item.checked === false
          ? "[ ] "
          : "• ";
    const hang = textWidth(marker);
    const body = blocks(item.children, width - hang, accent);
    body.forEach((line, j) =>
      out.push([
        j === 0 ? span(marker, { fg: accent }) : span(" ".repeat(hang)),
        ...line,
      ]),
    );
  });
  return out;
}

function table(node: Table, width: number): Line[] {
  const rows = node.children.map((row) =>
    row.children.map((cell) => plain(cell.children)),
  );
  const columns = Math.max(...rows.map((row) => row.length));
  const cell = Math.max(4, Math.floor((width - (columns - 1) * 3) / columns));
  return rows.map((row, r) =>
    row.flatMap((text, c) => [
      ...(c > 0 ? [span(" │ ", { fg: TONE.dim })] : []),
      span(truncate(text, cell).padEnd(cell), {
        fg: r === 0 ? TONE.ink : TONE.mute,
        bold: r === 0,
      }),
    ]),
  );
}

function plain(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((node) =>
      "value" in node
        ? node.value
        : "children" in node
          ? plain(node.children)
          : "",
    )
    .join("");
}

function inline(nodes: readonly PhrasingContent[], style: Style): Span[] {
  return nodes.flatMap((node): Span[] => {
    if (node.type === "text") {
      return [span(node.value.replace(/\s*\n\s*/g, " "), style)];
    }
    if (node.type === "strong") {
      return inline(node.children, { ...style, fg: TONE.ink, bold: true });
    }
    if (node.type === "inlineCode") return [span(node.value, { fg: TONE.ink })];
    if (node.type === "break") return [span(" ", style)];
    if (node.type === "link") {
      const label = plain(node.children);
      return label === node.url || label === ""
        ? [span(node.url, { fg: TONE.link })]
        : [
            ...inline(node.children, { ...style, fg: TONE.ink }),
            span(" ", style),
            span(`<${node.url}>`, { fg: TONE.link }),
          ];
    }
    if (node.type === "image") {
      return [span(`[image: ${node.alt ?? ""}]`, { fg: TONE.dim })];
    }
    // Emphasis and strikethrough have no terminal form worth the escape
    // codes; their text reads fine as it is.
    return "children" in node ? inline(node.children, style) : [];
  });
}
