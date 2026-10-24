import { docsBucket } from "~/server/docs/published/bucket";
import { readAsset } from "~/server/docs/published/reader";

/**
 * An image from a published project's docs, served from the bucket.
 *
 * The URL carries the version's digest, so a given URL never changes meaning
 * and can be cached for good. Only files under that version's `assets/`
 * prefix are reachable, by an extension the compiler approves (png, jpg, gif,
 * webp, avif, svg), and a path is checked segment by segment before it
 * becomes a key. The content type comes from the extension, never from the
 * object; `nosniff` keeps a browser to it; and a locked-down policy (no
 * script, no sandbox escape) rides along for a direct visit to an SVG. The
 * compiler already refused any SVG that could run anything: this is the
 * second lock on the same door.
 *
 * `.avif` is the one approved type the middleware matcher does not skip, and
 * the middleware replaces this policy with the site's. Still no looser than
 * the docs site's, which is the rule.
 */
export async function GET(
  _request: Request,
  context: {
    params: Promise<{ project: string; digest: string; path: string[] }>;
  },
) {
  const { project, digest, path } = await context.params;
  const bucket = docsBucket();
  let segments: string[];
  try {
    segments = path.map(decodeURIComponent);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const asset = bucket && (await readAsset(bucket, project, digest, segments));
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(asset.bytes, {
    headers: {
      "Content-Type": asset.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
