/**
 * A FAILING check, unlike everything in `check.ts`: a link that does not
 * resolve is not a judgment call about prose length, it is a 404 a reader
 * hits, and the contract (§2 internal links) asks for the build to say so
 * before it ships one.
 *
 * Content links pages one way only: a relative path to the Markdown file,
 * extension included (`../guides/schema.md#anchor`), or to a folder with a
 * trailing slash (`../guides/`). That is the form GitHub follows, so the same
 * link works in the repository and, once `links.ts` rewrites it, on the site.
 * How a path resolves, `_shared` mounts included, is `links.ts`'s business;
 * this file looks the result up. Two older forms are failures of their own,
 * so they cannot creep back: an absolute `/docs/…` URL and a relative link
 * with no extension. External URLs (`https://`, `mailto:`), site routes that
 * are not `/docs/`, and relative links to some other kind of asset
 * (`./diagram.png`) are out of scope and left alone.
 *
 * A link to a file resolves only to that page. A link to a folder resolves
 * when the folder's `index` is a page, or when some page's path starts with
 * `<folder>/` (children without an index, which the renderer lists). An anchor
 * on a folder link is checked against the folder's `index` page's headings
 * when one exists; with no index to check against, the anchor is left
 * unverified rather than failed for a listing this check has no headings for.
 *
 * A link has to name a real FILE, not merely a page the site serves: a link at
 * a mounted copy's own path (`workshops/getting-started/running.md`) resolves
 * on the site and is a 404 on GitHub, because the file lives under `_shared/`.
 * That is refused too, with the `_shared` path to use instead.
 *
 * Pages are read as markdown, through `parse.ts`'s `parseBody` with each
 * copy's variants resolved, rather than scanned line by line, so a link written
 * inside a fenced sample or a code span is never mistaken for a real one: the
 * parser already drew that line for `parse.ts`'s heading extraction, and a
 * second, looser reading here would only be a second place for the two to
 * disagree.
 *
 * Checked against the compiled `pages` array, after mounting: a `_shared`
 * page that links to a sibling is checked once per project it mounts into,
 * since the sibling is a different emitted page in each.
 */
import { visit } from "unist-util-visit";
import { classifyLink, linkSourceOf, SHARED_DIR } from "./links.js";
import { parseBody } from "./parse.js";
import type { CompiledPage } from "./types.js";

export interface LinkCheckError {
  /** The page the broken link was found on, `.md` included. */
  file: string;
  /** 1-based, relative to the page's body (frontmatter already stripped). */
  line: number | null;
  message: string;
}

/**
 * Every internal link that does not resolve, across every page (mounted
 * copies included, each checked against the project it landed in).
 */
export function checkLinks(pages: readonly CompiledPage[]): LinkCheckError[] {
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const errors: LinkCheckError[] = [];

  for (const page of pages) {
    const file = labelFor(page);
    const from = linkSourceOf(page);
    const tree = parseBody(page.content, page.variants);

    visit(tree, (node) => {
      if (node.type !== "link" && node.type !== "definition") return;
      const { url, position } = node;
      const line = position?.start.line ?? null;

      const target = classifyLink(url, from);
      if (target.kind === "skip") return;
      if (target.kind === "invalid") {
        errors.push({
          file,
          line,
          message: `links to "${url}", which ${target.message}`,
        });
        return;
      }

      const resolved = resolvePath(target.path, target.folder, byPath, pages);

      if (resolved === null) {
        errors.push({
          file,
          line,
          message: `links to "${url}", which does not resolve to a page (looked for "${target.path}")`,
        });
        return;
      }

      if (
        resolved.kind === "page" &&
        resolved.page.mountedFrom !== null &&
        !target.file.startsWith(`${SHARED_DIR}/`)
      ) {
        errors.push({
          file,
          line,
          message: `links to "${url}", a mounted copy that exists on the site but not on GitHub — link its source instead, "${relativeTo(from.source, `${SHARED_DIR}/${resolved.page.mountedFrom}.md`)}"`,
        });
        return;
      }

      if (target.anchor !== null) {
        // A folder route with no index has no headings to check an anchor
        // against — left unverified rather than failed for a listing this
        // check cannot see into.
        const headingsPage =
          resolved.kind === "page" ? resolved.page : resolved.indexPage;
        if (headingsPage === null) return;

        const known = headingsPage.headings.some((h) => h.id === target.anchor);
        if (!known) {
          errors.push({
            file,
            line,
            message: `links to "${url}" — "${target.path}" has no heading with id "${target.anchor}"`,
          });
        }
      }
    });
  }

  return errors;
}

/** Where `path` resolves: an exact page, a folder (index page or listing), or nothing. */
type Resolved =
  | { kind: "page"; page: CompiledPage }
  | { kind: "folder"; indexPage: CompiledPage | null };

function resolvePath(
  path: string,
  folder: boolean,
  byPath: ReadonlyMap<string, CompiledPage>,
  pages: readonly CompiledPage[],
): Resolved | null {
  const direct = byPath.get(path);
  if (direct !== undefined && !folder) return { kind: "page", page: direct };

  // A link to a file names that page and nothing else.
  if (!folder) return null;

  const indexPage = byPath.get(`${path}/index`) ?? null;
  if (indexPage !== null) return { kind: "folder", indexPage };

  const prefix = `${path}/`;
  const hasChildren = pages.some((p) => p.path.startsWith(prefix));
  if (hasChildren) return { kind: "folder", indexPage: null };

  return null;
}

function labelFor(page: CompiledPage): string {
  return page.mountedFrom !== null
    ? `_shared/${page.mountedFrom}.md`
    : `${page.path}.md`;
}

/** `to` as a relative path from the folder `fromSource` sits in. */
function relativeTo(fromSource: string, to: string): string {
  const from = fromSource.split("/").slice(0, -1);
  const target = to.split("/");
  let common = 0;
  while (
    common < from.length &&
    common < target.length - 1 &&
    from[common] === target[common]
  ) {
    common++;
  }
  const up = from.slice(common).map(() => "..");
  const rel = [...up, ...target.slice(common)].join("/");
  return up.length === 0 ? `./${rel}` : rel;
}
