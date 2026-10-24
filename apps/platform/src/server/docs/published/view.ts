import {
  buildDocsSidebarSections,
  buildDocsTree,
  stepPositionOf,
  type DocsFolderSettings,
  type DocsSidebarTree,
  type DocsTreeNode,
} from "~/lib/docsTree";
import { splitProjectPath } from "~/lib/docsSlug";
import type { DocHeading } from "~/lib/toc";
import type { PublishedContent, PublishedPointer } from "./schema";

/**
 * One published project as the docs routes read it: the pointer that named the
 * version, the validated content, and lookups over it. Nothing here touches
 * the bucket or the clock, so it is the same for a cached read as a fresh one.
 */
export interface PublishedProject {
  slug: string;
  pointer: PublishedPointer;
  name: string;
  description: string | null;
  os: string[];
  /** Project-relative page path -> page, in the content's order. */
  pages: ReadonlyMap<string, PublishedPage>;
  folders: DocsFolderSettings[];
  /** Approved asset paths (relative to the docs directory). */
  assets: ReadonlySet<string>;
}

export interface PublishedPage {
  /** Project-relative, no extension. */
  path: string;
  title: string;
  description: string | null;
  order: number | null;
  section: PublishedContent["pages"][number]["section"];
  headings: DocHeading[];
  /** As compiled and stored. Not yet safe to place in a page: see `pageHtml`. */
  html: string;
}

export function buildPublishedProject(
  pointer: PublishedPointer,
  content: PublishedContent,
): PublishedProject {
  const pages = new Map<string, PublishedPage>();
  for (const page of content.pages) {
    const path = splitProjectPath(page.path).path;
    pages.set(path, {
      path,
      title: page.title,
      description: page.description,
      order: page.order,
      section: page.section,
      headings: page.headings,
      html: page.html,
    });
  }
  return {
    slug: pointer.project,
    pointer,
    name: content.project.name,
    description: content.project.description,
    os: content.project.os,
    pages,
    folders: content.folders.map((folder) => ({
      path: splitProjectPath(folder.path).path,
      name: folder.name,
      order: folder.order,
      steps: folder.steps,
    })),
    assets: new Set(content.assets.map((asset) => asset.path)),
  };
}

const rows = (project: PublishedProject) =>
  [...project.pages.values()].map(({ path, title, order }) => ({
    path,
    title,
    order,
  }));

export function publishedTree(project: PublishedProject): DocsTreeNode[] {
  return buildDocsTree(rows(project), project.folders);
}

export function publishedSidebar(project: PublishedProject): DocsSidebarTree {
  return buildDocsSidebarSections(
    [...project.pages.values()].map(({ path, title, order, section }) => ({
      path,
      title,
      order,
      section,
    })),
    project.folders,
  );
}

export function publishedStepNav(project: PublishedProject, path: string) {
  const position = stepPositionOf(publishedTree(project), path);
  if (!position) return null;
  return {
    course: position.folder.name,
    steps: position.steps.map(({ path, title }) => ({ path, title })),
    index: position.index,
  };
}

/** Where an asset is served from. The digest is in the URL, so it can be cached for good. */
export function assetUrl(
  project: Pick<PublishedProject, "slug" | "pointer">,
  assetPath: string,
): string {
  return `/docs-assets/${project.slug}/${project.pointer.digest}/${assetPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Resolves `reference` against a page's directory; null when it climbs out or is malformed. */
function resolveAsset(dir: string, reference: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(reference.replace(/[?#].*$/, ""));
  } catch {
    return null;
  }
  if (decoded === "" || decoded.includes("\\") || decoded.includes("\0")) {
    return null;
  }
  const out = dir === "" ? [] : dir.split("/");
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.pop() === undefined) return null;
    } else {
      out.push(segment);
    }
  }
  return out.length === 0 ? null : out.join("/");
}

const TAG = /<(img|a)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const ATTRIBUTE = /(\s)([A-Za-z][\w:-]*)(="[^"]*")?/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;

/**
 * A page's HTML as it goes into the site.
 *
 * The only change is to the references that name a file in the project's docs
 * directory: an `<img src>` or a link to an approved asset is relative in the
 * compiled page (the compiler cannot know where the bytes will be served from),
 * so it is pointed at this version's asset route. A reference that does not
 * resolve to an approved asset loses its URL rather than keeping a path that
 * would be read against the site. Nothing is parsed back into a tree, nothing
 * the compiler stripped is let back in, and every other byte is left alone.
 */
export function pageHtml(project: PublishedProject, page: PublishedPage) {
  const dir = page.path.split("/").slice(0, -1).join("/");
  return page.html.replace(TAG, (tag, name: string) => {
    const attribute = name === "img" ? "src" : "href";
    return tag.replace(
      ATTRIBUTE,
      (whole, space: string, attr: string, value: string | undefined) => {
        if (attr.toLowerCase() !== attribute || value === undefined) {
          return whole;
        }
        const reference = value.slice(2, -1).replaceAll("&amp;", "&");
        if (name === "a" && EXTERNAL.test(reference)) return whole;
        const resolved = resolveAsset(dir, reference);
        if (resolved === null || !project.assets.has(resolved)) return "";
        return `${space}${attr}="${assetUrl(project, resolved)}"`;
      },
    );
  });
}
