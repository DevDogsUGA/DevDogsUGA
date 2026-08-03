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
export function parseDocFile(
  source: string,
  fileName: string,
): ParsedDocFile {
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
    frontmatter,
    headings,
    content,
    plainText: blockText(tree),
  };
}
