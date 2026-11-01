import { inDocsGuide, DOCS_MENU_PROJECTS } from "~/config/docs";
import type { DocsMenuEntry } from "~/config/docs";

/** Which navbar menu a reader is inside: Docs, Contribute, or neither. */
export type DocsSection = "docs" | "contribute" | null;

/** The docs project an address is inside, from `/docs/<project>/…`. */
export function docsSlugOf(pathname: string | null): string | null {
  if (pathname === null) return null;
  const [, first, second] = pathname.split("/");
  return first === "docs" && second ? decodeURIComponent(second) : null;
}

/**
 * Which menu owns `pathname`. A guide for building on DevDogs lives inside the
 * platform's folder, so a guide wins over the project around it; otherwise a
 * Project of the Contribute menu owns its whole docs, and anything else under
 * `/docs` is Docs.
 */
export function docsSectionOf(
  pathname: string | null,
  contribute: readonly DocsMenuEntry[],
): DocsSection {
  if (pathname === null) return null;
  if (pathname !== "/docs" && !pathname.startsWith("/docs/")) return null;
  if (inDocsGuide(pathname)) return "docs";
  const slug = docsSlugOf(pathname);
  if (slug !== null && contribute.some((entry) => entry.project === slug))
    return "contribute";
  return "docs";
}

/**
 * The first crumb of a docs search result: whether the page is Docs or
 * Contribute. `path` is project-relative. A published project's pages are
 * always Contribute's.
 */
export function docsSectionLabel(
  project: string,
  path: string,
): "Docs" | "Contribute" {
  if (DOCS_MENU_PROJECTS.has(project)) return "Docs";
  const address = `/docs/${project}${path ? `/${path}` : ""}`;
  return inDocsGuide(address) ? "Docs" : "Contribute";
}
