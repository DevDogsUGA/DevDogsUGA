import { ACCENT, PageCard } from "@devdogsuga/open-graph";
import { ogResponse, size } from "~/lib/ogImage";
import { toTitleCase } from "~/lib/toTitleCase";
import {
  docsPathExists,
  getDocsFolder,
  getDocsPage,
} from "~/server/docs/queries";

/**
 * The link card for one docs page.
 *
 * A route handler rather than an `opengraph-image.tsx`, because the docs live
 * under `[...slug]` and Next refuses a metadata image inside a catch-all
 * segment — it appends a suffix to the segment's route id, and the catch-all
 * has to be last:
 *
 *     Catch-all must be the last part of the URL in route
 *     "/docs/[project]/[...slug]/opengraph-image-8uknek"
 *
 * So the docs page points `openGraph.images` at this instead. Every other
 * public route uses the file convention; this is the one that cannot.
 *
 * ## Why this takes a path and not a title
 *
 * The obvious shape for a card behind a query string is `?title=…`, and it is
 * the wrong one: it turns this into a renderer of arbitrary text onto the
 * club's own branding, at the club's own domain, for anybody who can write a
 * URL. What it takes instead is a project and a path, which it looks up in the
 * same compiled docs artifact the page reads. Nothing that is not already a
 * published DevDogs docs page can be drawn.
 *
 * The lookup is in-memory: `@devdogsuga/docs` compiles the markdown into the
 * bundle, so this costs no query.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const project = params.get("project") ?? "";
  const path = params.get("path") ?? "";

  // Both lookups answer null for anything not live yet, so a scheduled page
  // has no card. It is a 404, not the generic Docs card: the card is what a
  // link to the page unfurls to, and even the fallback would confirm that a
  // path exists.
  const page = await getDocsPage(project, path);
  const folder = page ? null : await getDocsFolder(project, path);
  if (!page && !folder && docsPathExists(project, path)) {
    return new Response("Not found", { status: 404 });
  }

  // Neither a page nor a folder: the club's generic Docs card, and never the
  // caller's strings.
  const found = page ?? folder;

  return ogResponse(
    PageCard({
      ...size,
      title: page?.title ?? folder?.name ?? "Docs",
      description: page?.description ?? "Documentation for DevDogs projects.",
      eyebrow: found ? `${toTitleCase(project)} docs` : "Docs",
      accent: ACCENT.emerald400,
      footer: found ? `devdogsuga.org/docs/${project}` : "devdogsuga.org/docs",
    }),
  );
}
