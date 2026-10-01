import type { VariantContext } from "./variants.js";

/** A heading extracted from a markdown document, used to build a page's TOC. */
export interface DocHeading {
  id: string;
  title: string;
  depth: number;
}

/**
 * Which block of a project's sidebar a page sits in. Fixed render order:
 * Overview (a project's own `index.md`, which carries `section: null` rather
 * than any of these four), Getting started, Guides, Infrastructure, Reference.
 *
 * "infrastructure" is maintainer/officer-only material: deploys, secrets,
 * runbooks, OAuth/GitHub App setup, CI, the docs system itself.
 */
export type DocsSection =
  "getting-started" | "guides" | "infrastructure" | "reference";

/**
 * A folder's own settings, from an `index.md` that has frontmatter and no
 * body. Such a file is not a page: it names and places the folder it sits in,
 * and the folder's route shows what the folder holds. See `compileDocs`.
 */
export interface DocsFolder {
  /** The immediate subfolder of `docs/` this folder belongs to. */
  project: string;
  /** Path relative to `docs/`, project prefix included: "workshops/supabase". */
  path: string;
  /** From `name:`, else the title-cased folder name. */
  name: string;
  description: string | null;
  /** Where the folder sits among its siblings, from `order:`. */
  order: number | null;
  /**
   * `steps: true`: the folder's pages are an ordered course, read one after
   * another, so the platform links each to the next and tracks which ones a
   * reader has finished.
   */
  steps: boolean;
  /**
   * `scheduled:`, as a UTC ISO time: the folder and everything in it is
   * hidden from readers until then. Inherited from the nearest scheduled
   * ancestor folder when the folder declares none, and never earlier than it.
   * Null when nothing schedules it.
   */
  publishAt: string | null;
}

/** Everything `parseDocFile` derives from one markdown source. */
export interface ParsedDocFile {
  title: string;
  description: string | null;
  /**
   * Where the page sits among its siblings, from `order:` in the frontmatter.
   * Null when it declares none, which is the normal case for a hand-written
   * guide: the generated reference numbers every page it writes, and written
   * pages opt in one at a time.
   */
  order: number | null;
  frontmatter: Record<string, unknown>;
  headings: DocHeading[];
  /** Markdown with frontmatter stripped. */
  content: string;
  /** The document flattened to plain text, for full-text search and snippets. */
  plainText: string;
}

/** One documentation page, keyed by its path relative to `docs/`. */
export interface DocsPage extends Omit<ParsedDocFile, "content"> {
  /**
   * The body rendered to HTML at build time (see `render.ts`), variants
   * resolved for this page's project. Headings and `plainText` are this copy's
   * too: a `_shared` page's `only{project=…}` blocks differ per mount.
   */
  html: string;
  /** The immediate subfolder of `docs/` this page belongs to, e.g. "platform". */
  project: string;
  /** Path relative to `docs/`, project prefix included, no extension. */
  path: string;
  /**
   * The sidebar block this page renders under, or null for a project's own
   * `index.md` (the Overview, which sits outside the four sections). See
   * `DocsSection`.
   */
  section: DocsSection | null;
  /**
   * Set on a page emitted from `docs/_shared/**` (see `compileDocs`'s header):
   * the path it was mounted from, relative to `_shared/`, extension stripped.
   * Null for every page whose source lives directly under its own project.
   * Carried through so an "edit this page" link can point at the one file
   * that actually owns the content, not the copy a reader happened to land on.
   */
  mountedFrom: string | null;
  /**
   * When the page becomes visible, as a UTC ISO time, from its own
   * `scheduled:` or else its folder's. A page's own time can only be later
   * than its folder's. Null for a page that is always visible.
   */
  publishAt: string | null;
}

/**
 * A page as `compileDocs` returns it: everything but the HTML, which is
 * rendered asynchronously by `emitDocsModule`, plus what rendering and the
 * failing checks need and the emitted module does not carry.
 */
export interface CompiledPage extends Omit<DocsPage, "html"> {
  /** Markdown with frontmatter stripped, variants unresolved. */
  content: string;
  variants: VariantContext;
}

/** A project, one immediate subfolder of `docs/`, as shown on the docs landing page. */
export interface DocsProject {
  slug: string;
  name: string;
  description: string | null;
  /** Where the project sits in the listing, from its own `index.md`. */
  order: number | null;
  /**
   * The platforms the project supports, from `os:` in its `index.md`: the
   * values its `os` tabs must cover and its platform switcher offers. See
   * `variants.ts`.
   */
  os: string[];
}
