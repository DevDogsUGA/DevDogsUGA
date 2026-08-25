import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import type { Heading, Node, Parent } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { DocHeading, ParsedDocFile } from "./types.js";

export function toTitleCase(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const processor = unified().use(remarkParse).use(remarkGfm);

/** mdast node types that occupy their own block, as opposed to inline content. */
const BLOCK_TYPES = new Set([
  "blockquote",
  "code",
  "definition",
  "footnoteDefinition",
  "heading",
  "html",
  "list",
  "listItem",
  "paragraph",
  "table",
  "tableCell",
  "tableRow",
  "thematicBreak",
]);

/**
 * Flattens a node to text, separating blocks with a blank line.
 *
 * `toString` on its own concatenates every descendant with no delimiter, so a
 * heading's last word fuses with the next paragraph's first word ("Caching
 * StrategyThis project…"). Postgres then tokenises the pair as one word, which
 * makes the text on either side of every block boundary unsearchable and
 * garbles ts_headline snippets. Recursing until the children are inline keeps
 * `toString`'s handling of emphasis, links, and inline code intact.
 */
/**
 * The GitHub alert markers, which are prose to this parser and a callout to
 * the renderer.
 *
 * `remark-github-blockquote-alert` runs in the PLATFORM's pipeline, not this
 * one — rendering is not this package's job — so a `> [!NOTE]` blockquote
 * reaches `blockText` as a paragraph whose first line is the literal text
 * `[!NOTE]`. Left in, it lands in `plainText`, which is what the search index
 * is built from and what `ts_headline` cuts snippets out of, so a result for
 * any generated reference page would open with `[!NOTE]` where its first
 * sentence should be. Every one of those pages starts with an alert.
 *
 * Dropped rather than translated to "Note": the word is chrome the renderer
 * draws, it is not something anybody searches for, and putting it in the index
 * would only move the noise from the marker to the label.
 */
const ALERT_MARKER = /^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n?/gim;

function stripAlertMarkers(text: string): string {
  return text.replace(ALERT_MARKER, "");
}

function blockText(node: Node): string {
  const children = (node as Parent).children as Node[] | undefined;
  if (children?.some((child) => BLOCK_TYPES.has(child.type))) {
    return children
      .map(blockText)
      .filter((text) => text !== "")
      .join("\n\n");
  }
  return toString(node);
}

/**
 * Parses a raw markdown source into everything a docs page needs. Heading ids
 * use github-slugger so they match the anchors that rehype-slug generates at
 * render time.
 */
export function parseDocFile(source: string, fileName: string): ParsedDocFile {
  const { data: frontmatter, content } = matter(source);

  const tree = processor.parse(content);
  const slugger = new GithubSlugger();

  const headings: DocHeading[] = [];
  visit(tree, "heading", (node: Heading) => {
    const text = toString(node);
    headings.push({
      id: slugger.slug(text),
      title: text,
      depth: node.depth,
    });
  });

  // Explicit frontmatter wins; otherwise the document's own `# ` heading, which
  // is what docs/platform/documentation-system/writing-docs.md tells authors to
  // expect. Title-cased filename only as a last resort (no frontmatter, no h1).
  const title =
    typeof frontmatter.name === "string"
      ? frontmatter.name
      : (headings.find((heading) => heading.depth === 1)?.title ??
        toTitleCase(fileName.replace(/\.md$/, "")));

  return {
    title,
    description:
      typeof frontmatter.description === "string"
        ? frontmatter.description
        : null,
    // Finite, or nothing. YAML has literals for NaN and infinity (`.nan`,
    // `.inf`), and either one poisons every comparison in the sidebar sort —
    // NaN makes the comparator answer 0 to everything, which leaves the
    // surrounding pages in whatever order the engine happened to have them in.
    // Anything that is not a number at all — `order: first`, `order: "3"` — is
    // a typo rather than an instruction, and a page with a typo sorting where
    // an undeclared page sorts is the outcome an author will notice.
    order:
      typeof frontmatter.order === "number" &&
      Number.isFinite(frontmatter.order)
        ? frontmatter.order
        : null,
    frontmatter,
    headings,
    content,
    plainText: stripAlertMarkers(blockText(tree)),
  };
}
