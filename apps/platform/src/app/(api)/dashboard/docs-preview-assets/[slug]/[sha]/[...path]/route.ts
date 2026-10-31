import { loadCaller } from "~/server/auth/access";
import { livePreviews } from "~/server/docs/livePreview";
import { mayPreviewDocs } from "~/server/docs/previewAccess";
import { resolvePreviewTarget } from "~/server/docs/previewTarget";

/**
 * An image from the live docs preview, read from the commit the page was
 * rendered at.
 *
 * Gated like the pages (`previewAccess.ts`), and a 404 for everything else: a
 * different answer for "not allowed" would confirm the project exists. Only a
 * file the compile approved as an asset is reachable, by the path it has in the
 * compiled preview and never one the request makes up; the bytes are checked
 * against the hash the compile took; the content type comes from the approved
 * extension; `nosniff` keeps a browser to it; and a locked-down policy rides
 * along for a direct visit to an SVG, as on `/docs-assets`. Private, because who
 * may ask is a fact about the session.
 */
const NOT_FOUND = () => new Response("Not found", { status: 404 });

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ slug: string; sha: string; path: string[] }>;
  },
) {
  const { slug, sha, path } = await context.params;
  let rel: string;
  try {
    rel = path.map(decodeURIComponent).join("/");
  } catch {
    return NOT_FOUND();
  }
  const caller = await loadCaller();
  if (!caller) return NOT_FOUND();
  const project = await resolvePreviewTarget(caller, decodeURIComponent(slug));
  if (!project || !mayPreviewDocs(project.facts)) return NOT_FOUND();

  const loader = livePreviews();
  const loaded = await loader.load(
    { slug: project.slug, repoId: project.repoId },
    sha,
  );
  if (!loaded.ok) return NOT_FOUND();
  const asset = await loader.asset(loaded.preview, rel);
  if (!asset) return NOT_FOUND();
  return new Response(asset.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": asset.type,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
