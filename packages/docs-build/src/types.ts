/** A heading extracted from a markdown document, used to build a page's TOC. */
export interface DocHeading {
  id: string;
  title: string;
  depth: number;
}

/** Everything `parseDocFile` derives from one markdown source. */
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

/** One documentation page, keyed by its path relative to `docs/`. */
export interface DocsPage extends ParsedDocFile {
  /** The immediate subfolder of `docs/` this page belongs to, e.g. "platform". */
  project: string;
  /** Path relative to `docs/`, project prefix included, no extension. */
  path: string;
}

/** A project — one immediate subfolder of `docs/` — as shown on the docs landing page. */
export interface DocsProject {
  slug: string;
  name: string;
  description: string | null;
}
