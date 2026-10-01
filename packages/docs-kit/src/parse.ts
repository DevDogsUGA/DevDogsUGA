import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import type { Heading, Node, Parent, Root } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { DocHeading, ParsedDocFile } from "./types.js";
import { resolveVariants, type VariantContext } from "./variants.js";

export function toTitleCase(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * How every module in this package reads markdown. The renderer (`render.ts`)
 * starts from the same three syntax extensions, so a heading, link or command
 * this reader finds is one the reader of the page sees: directives so a
 * `:::tabs` block is a block and not a paragraph of colons, math so a `$` in
 * a formula is not taken for anything else.
 */
export const markdownReader = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkGfm)
  .use(remarkMath);

const processor = markdownReader;

/**
 * One emitted copy's body as a tree, variants resolved for its project: what
 * the link and command checks walk, and what headings and search text come
 * from. Throws a `DocsBuildError` on a malformed variant (see `variants.ts`).
 */
export function parseBody(content: string, ctx: VariantContext): Root {
  const tree = markdownReader.parse(content);
  resolveVariants(tree, ctx);
  return tree;
}

/**
 * Heading ids use github-slugger, which is what rehype-slug runs at render
 * time, so a TOC entry and the anchor it jumps to agree.
 */
export function headingsOf(tree: Root): DocHeading[] {
  const slugger = new GithubSlugger();
  const headings: DocHeading[] = [];
  visit(tree, "heading", (node: Heading) => {
    const text = toString(node);
    headings.push({ id: slugger.slug(text), title: text, depth: node.depth });
  });
  return headings;
}

/** The body flattened to plain text, for full-text search and snippets. */
export function plainTextOf(tree: Root): string {
  return stripAlertMarkers(blockText(tree));
}

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
 * The GitHub alert markers, prose to this parser and a callout to the renderer.
 *
 * `remark-github-blockquote-alert` runs in the PLATFORM's pipeline, not this
 * one; rendering is not this package's job. So a `> [!NOTE]` blockquote reaches
 * `blockText` as a paragraph whose first line is the literal text `[!NOTE]`.
 * Left in, it lands in `plainText`, which the search index is built from and
 * which `ts_headline` cuts snippets out of, so a result for any generated
 * reference page would open with `[!NOTE]` where its first sentence should be.
 * Every one of those pages starts with an alert.
 *
 * Dropped rather than translated to "Note": the word is chrome the renderer
 * draws, nobody searches for it, and indexing it would move the noise from the
 * marker to the label.
 */
const ALERT_MARKER = /^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n?/gim;

function stripAlertMarkers(text: string): string {
  return text.replace(ALERT_MARKER, "");
}

/**
 * Flattens a node to text, separating blocks with a blank line.
 *
 * `toString` alone concatenates every descendant with no delimiter, so a
 * heading's last word fuses with the next paragraph's first word ("Caching
 * StrategyThis project..."). Postgres then tokenises the pair as one word,
 * which makes the text on either side of every block boundary unsearchable and
 * garbles ts_headline snippets. Recursing until the children are inline keeps
 * `toString`'s handling of emphasis, links, and inline code intact.
 */
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
  const headings = headingsOf(tree);

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
    // `.inf`), and either one poisons every comparison in the sidebar sort:
    // NaN makes the comparator answer 0 to everything, leaving the surrounding
    // pages in whatever order the engine happened to have them in. Anything
    // that is not a number at all, `order: first` or `order: "3"`, is a typo
    // rather than an instruction, and a page with a typo sorting where an
    // undeclared page sorts is the outcome an author will notice.
    order:
      typeof frontmatter.order === "number" &&
      Number.isFinite(frontmatter.order)
        ? frontmatter.order
        : null,
    frontmatter,
    headings,
    content,
    plainText: plainTextOf(tree),
  };
}
