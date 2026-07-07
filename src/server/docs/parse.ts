import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import type { Heading } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { DocHeading } from "~/lib/toc";

export interface ParsedDocFile {
  title: string;
  description: string | null;
  frontmatter: Record<string, unknown>;
  headings: DocHeading[];
  /** Markdown with frontmatter stripped. */
  content: string;
  /** The document flattened to plain text, for full-text search and snippets. */
  plainText: string;
}

export function toTitleCase(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const processor = unified().use(remarkParse).use(remarkGfm);

/**
 * Parses a raw markdown source into everything the docs tables store for a
 * page. Heading ids use github-slugger so they match the anchors that
 * rehype-slug generates at render time.
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

  const title =
    typeof frontmatter.name === "string"
      ? frontmatter.name
      : toTitleCase(fileName.replace(/\.md$/, ""));

  return {
    title,
    description:
      typeof frontmatter.description === "string"
        ? frontmatter.description
        : null,
    frontmatter,
    headings,
    content,
    plainText: toString(tree),
  };
}
