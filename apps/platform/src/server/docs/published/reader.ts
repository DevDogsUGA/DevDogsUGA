import {
  DIGEST_PATTERN,
  SLUG_PATTERN,
  contentSchema,
  pointerSchema,
  searchSchema,
} from "./schema";
import type {
  PublishedContent,
  PublishedPointer,
  PublishedSearchEntry,
} from "./schema";
import type { DocsBucket } from "./bucket";

/**
 * Reads a publication out of the bucket. Layout (written by
 * `.github/scripts/docs-publish.mjs`):
 *
 *   projects/<slug>/current.json                      the pointer, written last
 *   projects/<slug>/versions/<digest>/content.json    pages, folders, assets
 *   projects/<slug>/versions/<digest>/search.json     search entries
 *   projects/<slug>/versions/<digest>/assets/<path>   image bytes
 *
 * Everything here takes the bucket as an argument and answers `null` for
 * anything missing or malformed, so one bad object hides one project (and is
 * logged) instead of breaking the docs.
 */

const POINTER_MAX_BYTES = 16 * 1024;
const CONTENT_MAX_BYTES = 32 * 1024 * 1024;
const SEARCH_MAX_BYTES = 16 * 1024 * 1024;
export const ASSET_MAX_BYTES = 4 * 1024 * 1024;
/** Projects the index will read pointers for; the map is reviewed, so this is a backstop. */
const MAX_PROJECTS = 50;

const SAFE_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export type PointerResult =
  | { status: "ok"; pointer: PublishedPointer }
  | { status: "missing" }
  | { status: "malformed" };

async function readJson(
  bucket: DocsBucket,
  key: string,
  maxBytes: number,
): Promise<{ found: false } | { found: true; value: unknown } | "bad"> {
  const object = await bucket.get(key);
  if (object === null) return { found: false };
  if (object.size > maxBytes) return "bad";
  try {
    return { found: true, value: JSON.parse(await object.text()) };
  } catch {
    return "bad";
  }
}

export async function readPointer(
  bucket: DocsBucket,
  slug: string,
): Promise<PointerResult> {
  if (!SLUG_PATTERN.test(slug)) return { status: "missing" };
  const read = await readJson(
    bucket,
    `projects/${slug}/current.json`,
    POINTER_MAX_BYTES,
  );
  if (read === "bad") return { status: "malformed" };
  if (!read.found) return { status: "missing" };
  const parsed = pointerSchema.safeParse(read.value);
  // A pointer that names another project or destination was copied or edited
  // by hand: not something to serve under this slug.
  if (
    !parsed.success ||
    parsed.data.project !== slug ||
    parsed.data.destination !== `/docs/${slug}`
  ) {
    return { status: "malformed" };
  }
  return { status: "ok", pointer: parsed.data };
}

/**
 * Every project with a usable pointer. `reserved` slugs (the club's own docs)
 * are skipped: those are bundled and a bucket entry never shadows them.
 */
export async function listPublishedPointers(
  bucket: DocsBucket,
  reserved: ReadonlySet<string>,
): Promise<PublishedPointer[]> {
  const slugs: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix: "projects/",
      delimiter: "/",
      ...(cursor ? { cursor } : {}),
    });
    for (const prefix of page.delimitedPrefixes) {
      const slug = prefix.slice("projects/".length).replace(/\/$/, "");
      if (SLUG_PATTERN.test(slug) && !reserved.has(slug)) slugs.push(slug);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && slugs.length < MAX_PROJECTS);

  const results = await Promise.all(
    slugs.slice(0, MAX_PROJECTS).map(async (slug) => {
      const result = await readPointer(bucket, slug);
      if (result.status === "malformed") {
        console.warn(`[docs] ignoring malformed pointer for "${slug}"`);
      }
      return result;
    }),
  );
  return results.flatMap((r) => (r.status === "ok" ? [r.pointer] : []));
}

type Version = Pick<PublishedPointer, "project" | "digest">;

const versionKey = (pointer: Version, file: string) =>
  `projects/${pointer.project}/versions/${pointer.digest}/${file}`;

export async function readContent(
  bucket: DocsBucket,
  pointer: Version,
): Promise<PublishedContent | null> {
  const read = await readJson(
    bucket,
    versionKey(pointer, "content.json"),
    CONTENT_MAX_BYTES,
  );
  if (read === "bad" || !read.found) {
    if (read === "bad") {
      console.warn(`[docs] unreadable content for "${pointer.project}"`);
    }
    return null;
  }
  const parsed = contentSchema(pointer.project).safeParse(read.value);
  if (!parsed.success) {
    console.warn(
      `[docs] content for "${pointer.project}" failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
    return null;
  }
  return parsed.data;
}

export async function readSearch(
  bucket: DocsBucket,
  pointer: Version,
): Promise<PublishedSearchEntry[] | null> {
  const read = await readJson(
    bucket,
    versionKey(pointer, "search.json"),
    SEARCH_MAX_BYTES,
  );
  if (read === "bad" || !read.found) return null;
  const parsed = searchSchema.safeParse(read.value);
  return parsed.success ? parsed.data : null;
}

const ASSET_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/** The content type for an asset path, from the same list the compiler approves; null for any other. */
export function assetContentType(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ASSET_TYPES[ext] ?? null;
}

/** An approved asset's bytes, or null. The path is checked segment by segment before it becomes a key. */
export async function readAsset(
  bucket: DocsBucket,
  slug: string,
  digest: string,
  segments: readonly string[],
): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  if (!SLUG_PATTERN.test(slug) || !DIGEST_PATTERN.test(digest)) return null;
  if (segments.length === 0 || segments.length > 8) return null;
  if (!segments.every((s) => SAFE_SEGMENT.test(s))) return null;
  const path = segments.join("/");
  const type = assetContentType(path);
  if (type === null) return null;
  const object = await bucket.get(
    `projects/${slug}/versions/${digest}/assets/${path}`,
  );
  if (object === null || object.size > ASSET_MAX_BYTES) return null;
  return { bytes: await object.arrayBuffer(), type };
}
