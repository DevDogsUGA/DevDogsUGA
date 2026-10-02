/**
 * A FAILING check, unlike everything in `check.ts`: a link that does not
 * resolve is not a judgment call about prose length, it is a 404 a reader
 * hits, and the contract (§2 internal links) asks for the build to say so
 * before it ships one.
 *
 * Two shapes are checked, both of them how this content actually links to
 * itself: an absolute `/docs/<project>/<path>(#anchor)` URL, the one a
 * reader's browser bar shows, and a relative link, the one a contributor
 * writes while looking at the file next to the one they are editing.
 * Anything else — `https://`, `mailto:`, a bare `#anchor` with no page
 * component when this page itself has no such heading — is either external or
 * already covered by a different rule, and is left alone.
 *
 * Either shape can point at a folder rather than a page: the renderer serves
 * folder routes (a folder's own `index` page when it has one, or a generated
 * listing when it does not), so a link resolves when its target is a page, OR
 * `<target>/index` is a page, OR some page's path starts with `<target>/`
 * (the folder has children even without an index). An anchor on a folder link
 * is checked against the folder's `index` page's headings when one exists;
 * with no index to check against, the anchor is left unverified rather than
 * failed for a listing this check has no headings for.
 *
 * A relative link is resolved the way a browser resolves a relative URL from
 * the linking page's own emitted path, treating that path as a file — so
 * `./x` is a sibling and `../x` a cousin, exactly per `dirname`/`join`, and
 * this holds however the source spells it: `./toolchain`, `../guides/x`, a
 * bare `toolchain` (a `_shared` page mounted into several projects has
 * nowhere to spell an absolute link that survives every mount, so it writes
 * these), with or without a trailing `.md`. A relative link whose last
 * segment carries a non-`.md` extension (`./diagram.png`, `../logo.svg`) is
 * read as a link to some other kind of asset this check has no opinion about,
 * not a page, and is left alone.
 *
 * Pages are read as markdown, through `parse.ts`'s `parseBody` with each
 * copy's variants resolved, rather than scanned line by line, so a link written inside a
 * fenced sample or a code span is never mistaken for a real one: the parser
 * already drew that line for `parse.ts`'s heading extraction, and a second,
 * looser reading here would only be a second place for the two to disagree.
 *
 * Checked against the compiled `pages` array, after mounting: a `_shared`
 * page that links to a sibling by relative path is checked once per project
 * it mounts into, since the same relative path can resolve to a different
 * page depending which project's tree it lands in.
 */
import type { Link } from "mdast";
import { visit } from "unist-util-visit";
import { parseBody } from "./parse.js";
import type { CompiledPage } from "./types.js";

export interface LinkCheckError {
  /** The page the broken link was found on, `.md` included. */
  file: string;
  /** 1-based, relative to the page's body (frontmatter already stripped). */
  line: number | null;
  message: string;
}

/** Where a link resolves to, before it is looked up. */
interface Target {
  /** A `DocsPage.path`: `<project>/<rest>`. */
  path: string;
  anchor: string | null;
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
    const tree = parseBody(page.content, page.variants);

    visit(tree, "link", (node: Link) => {
      const target = resolveTarget(node.url, page);
      if (target === null) return;

      const line = node.position?.start.line ?? null;
      const resolved = resolvePath(target.path, byPath, pages);

      if (resolved === null) {
        errors.push({
          file,
          line,
          message: `links to "${node.url}", which does not resolve to a page (looked for "${target.path}")`,
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
            message: `links to "${node.url}" — "${target.path}" has no heading with id "${target.anchor}"`,
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
  byPath: ReadonlyMap<string, CompiledPage>,
  pages: readonly CompiledPage[],
): Resolved | null {
  const direct = byPath.get(path);
  if (direct !== undefined) return { kind: "page", page: direct };

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

/**
 * What a link's `url` points at, or null when it is out of this check's scope
 * (external, a mailto, an image-only anchor, or a page that carries no
 * anchor at all to be wrong about).
 */
function resolveTarget(url: string, page: CompiledPage): Target | null {
  const hash = url.indexOf("#");
  const bare = hash === -1 ? url : url.slice(0, hash);
  const anchor = hash === -1 ? null : url.slice(hash + 1) || null;

  if (bare.startsWith("/docs/")) {
    const rest = bare.slice("/docs/".length).replace(/\/+$/, "");
    if (rest === "") return null; // the landing page itself, not one project's.

    const slash = rest.indexOf("/");
    const project = slash === -1 ? rest : rest.slice(0, slash);
    const tail = slash === -1 ? "" : rest.slice(slash + 1);
    return {
      path: tail === "" ? `${project}/index` : `${project}/${tail}`,
      anchor,
    };
  }

  if (bare === "") {
    return anchor === null ? null : { path: page.path, anchor };
  }

  const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(bare) || bare.startsWith("//");
  if (isExternal || bare.startsWith("/")) return null;

  const relative = stripMdSuffix(bare);
  if (relative === null) return null; // a relative link to some other kind of asset.

  const dir = dirname(page.path);
  return { path: normalise(join(dir, relative)), anchor };
}

/**
 * `bare` with a trailing `.md` removed, or unchanged when it names no file
 * extension at all (`./toolchain`, a bare `toolchain` — the folder-URL forms
 * `_shared` pages use so the same relative link survives every mount). Null
 * when the last segment carries some other extension (`./diagram.png`): a
 * relative link to an asset this check has no page to look up.
 */
function stripMdSuffix(bare: string): string | null {
  const lastSlash = bare.lastIndexOf("/");
  const lastSegment = bare.slice(lastSlash + 1);
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0) return bare; // no extension (or a dotfile-like leading dot).

  const ext = lastSegment.slice(dot + 1).toLowerCase();
  if (ext !== "md") return null;

  return bare.slice(0, bare.length - (lastSegment.length - dot));
}

/* Posix-style path helpers, deliberately not `node:path`: every `CompiledPage`
 * path is already posix-separated and relative, so pulling in the platform's
 * own path module would only risk it disagreeing with itself on Windows. */

function dirname(p: string): string {
  const at = p.lastIndexOf("/");
  return at === -1 ? "" : p.slice(0, at);
}

function join(dir: string, rel: string): string {
  return dir === "" ? rel : `${dir}/${rel}`;
}

function normalise(p: string): string {
  const out: string[] = [];
  for (const segment of p.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}
