/**
 * How a link written in docs content finds its page, shared by the renderer
 * (which rewrites it to a site URL) and the link check (which fails when it
 * does not resolve).
 *
 * The one form content may use for a page is a relative path to the Markdown
 * file, extension included: `../guides/schema.md`, `./running.md#anchor`,
 * `../../platform/guides/migrations.md`. That is the form github.com follows,
 * so the docs read the same in the repository as on the site, and it is
 * resolved here exactly as a file system would: against the folder the linking
 * file sits in, under `docs/`. A link to a folder ends in `/` instead
 * (`../guides/`), which GitHub also follows and which resolves to the folder's
 * own page or listing.
 *
 * Two older forms are refused rather than tolerated, so they cannot creep
 * back: an absolute `/docs/<project>/<path>` URL, and a relative link with no
 * extension (`./running`). Neither one works on GitHub.
 *
 * `_shared`: a page under `docs/_shared/` is emitted once per project it
 * mounts into, and its relative links have to work from `docs/_shared/…` on
 * GitHub AND land in the right project on the site. So a link is resolved
 * against the file's real location, and a target under `_shared/` means "the
 * copy mounted in the project this page is being emitted into":
 *
 * - `_shared/a.md` linking `./b.md` reaches `_shared/b.md`, which is
 *   `<project>/b` in every project that has it mounted.
 * - `workshops/index.md` linking `../_shared/getting-started/running.md`
 *   reaches `workshops/getting-started/running`, the copy mounted there.
 * - Any link into a project folder (`../../platform/guides/x.md`) is that
 *   project's page, whichever project the linking page was emitted into.
 * - A link into `_shared/` can name another project's mount with
 *   `?project=<slug>` (`../_shared/guides/stack/db.md?project=platform`).
 *   GitHub ignores the query and opens the shared file.
 *
 * A link straight at a mounted copy's path (`workshops/getting-started/…`)
 * resolves on the site but names no file on GitHub, so the link check refuses
 * it and asks for the `_shared` path.
 */
import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import type { CompiledPage } from "./types.js";

/** Content shared between projects lives here and is never a project. */
export const SHARED_DIR = "_shared";

/** Where a link was written: what its relative path is resolved against. */
export interface LinkSource {
  /** The project the page is emitted into. */
  project: string;
  /**
   * The page's file under `docs/`, no extension: `_shared/…` for a mounted
   * copy, else the page's own path.
   */
  source: string;
}

/** What a link points at. */
export type LinkTarget =
  /** Out of scope: external, a site route, or an asset. */
  | { kind: "skip" }
  /** An internal link that resolves to a page or folder, by emitted path. */
  | {
      kind: "page";
      /** An emitted page path, `<project>/<rest>`. */
      path: string;
      anchor: string | null;
      /** Written with a trailing `/`: any folder route will do. */
      folder: boolean;
      /** The target's file path under `docs/` before mounts were applied. */
      file: string;
    }
  /** A link form content may not use. */
  | { kind: "invalid"; message: string };

/** The source file of an emitted page, for `LinkSource`. */
export function linkSourceOf(
  page: Pick<CompiledPage, "project" | "path" | "mountedFrom">,
): LinkSource {
  return {
    project: page.project,
    source:
      page.mountedFrom !== null
        ? `${SHARED_DIR}/${page.mountedFrom}`
        : page.path,
  };
}

/** Classifies `url` as written on a page emitted from `from`. */
export function classifyLink(url: string, from: LinkSource): LinkTarget {
  const hash = url.indexOf("#");
  const beforeHash = hash === -1 ? url : url.slice(0, hash);
  const anchor = hash === -1 ? null : url.slice(hash + 1) || null;
  const question = beforeHash.indexOf("?");
  const bare = question === -1 ? beforeHash : beforeHash.slice(0, question);
  const query = question === -1 ? "" : beforeHash.slice(question + 1);

  if (bare === "") {
    if (anchor === null) return { kind: "skip" };
    return {
      kind: "page",
      path: pagePathOf(from),
      anchor,
      folder: false,
      file: from.source,
    };
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(bare) || bare.startsWith("//")) {
    return { kind: "skip" };
  }

  if (bare === "/docs" || bare.startsWith("/docs/")) {
    return {
      kind: "invalid",
      message: `is an absolute /docs/ URL, which GitHub does not follow — link the page's file relatively instead, like "../guides/page.md"`,
    };
  }
  if (bare.startsWith("/")) return { kind: "skip" };

  const folder = bare.endsWith("/");
  const lastSegment = bare.slice(bare.lastIndexOf("/") + 1);
  const dot = lastSegment.lastIndexOf(".");
  const extension = dot > 0 ? lastSegment.slice(dot + 1).toLowerCase() : null;

  if (!folder) {
    if (extension === null) {
      return {
        kind: "invalid",
        message: `has no file extension, so GitHub does not follow it — link the page's file, like "${bare}.md", or end a folder link with "/"`,
      };
    }
    // Some other kind of asset (`./diagram.png`): not a page, no opinion.
    if (extension !== "md") return { kind: "skip" };
  }

  const joined = resolveRelative(dirname(from.source), bare);
  if (joined === null) {
    return {
      kind: "invalid",
      message: "points outside docs/, where the site has nothing to link to",
    };
  }
  const file = folder ? joined : joined.replace(/\.md$/, "");

  let project = from.project;
  if (query !== "") {
    const mount = /^project=([a-z0-9-]+)$/.exec(query);
    if (mount === null || !file.startsWith(`${SHARED_DIR}/`)) {
      return {
        kind: "invalid",
        message: `has a query string, and the only one allowed is "?project=<slug>" on a link into _shared/`,
      };
    }
    project = mount[1]!;
  }

  return {
    kind: "page",
    path: mountedPath(file, project),
    anchor,
    folder,
    file,
  };
}

/** The emitted path of the page `from` describes. */
function pagePathOf(from: LinkSource): string {
  return mountedPath(from.source, from.project);
}

/** A file under `_shared/` is the copy mounted into `project`. */
function mountedPath(file: string, project: string): string {
  const prefix = `${SHARED_DIR}/`;
  return file.startsWith(prefix)
    ? `${project}/${file.slice(prefix.length)}`
    : file;
}

/** The site URL for an emitted page path, `index` pages at their folder. */
export function siteHref(path: string, anchor: string | null): string {
  const route = path.replace(/(^|\/)index$/, "");
  return (
    `/docs/${route}`.replace(/\/$/, "") + (anchor === null ? "" : `#${anchor}`)
  );
}

/**
 * Rewrites every internal link and link definition in a page to its site
 * URL. A link that does not resolve to anything is left as written: the link
 * check is what fails the build for it, and a renderer that threw would hide
 * every other problem on the page behind the first.
 */
export function remarkRewriteLinks() {
  return (tree: Root, file: { data: Record<string, unknown> }) => {
    const from = file.data["link"] as LinkSource | undefined;
    if (!from) throw new Error("remarkRewriteLinks: file.data.link is unset");

    visit(tree, (node) => {
      if (node.type !== "link" && node.type !== "definition") return;
      const target = classifyLink(node.url, from);
      if (target.kind !== "page") return;
      // A same-page `#anchor` stays as it is: it is already right.
      if (node.url.startsWith("#")) return;
      node.url = siteHref(target.path, target.anchor);
    });
  };
}

/* Posix-style path helpers, deliberately not `node:path`: every path here is
 * already posix-separated and relative to `docs/`. */

function dirname(p: string): string {
  const at = p.lastIndexOf("/");
  return at === -1 ? "" : p.slice(0, at);
}

/** `rel` below `dir`, normalised; null when it climbs out of `docs/`. */
function resolveRelative(dir: string, rel: string): string | null {
  const out: string[] = dir === "" ? [] : dir.split("/");
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}
