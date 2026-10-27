import { cacheLife } from "next/cache";
import { getDocsProjects } from "~/server/docs/queries";
import { docsBucket } from "./bucket";
import { listPublishedPointers, readContent, readSearch } from "./reader";
import { SLUG_PATTERN } from "./schema";
import type {
  PublishedContent,
  PublishedPointer,
  PublishedSearchEntry,
} from "./schema";
import { buildPublishedProject, type PublishedProject } from "./view";

export type { PublishedProject } from "./view";

/**
 * The published projects, as the docs routes and search ask for them.
 *
 * ## Freshness
 *
 * Two reads, with two lifetimes:
 *
 * - `publishedPointers`: which projects exist and which version each one is
 *   on. It is the one thing that changes when a project publishes, so it lives
 *   for thirty seconds. vinext gives a page the shortest `cacheLife` it saw
 *   while rendering, so a page that reads it is itself cached for at most that
 *   long: a new publication shows within about a minute, with no deploy.
 * - `publishedContent`: a version's pages, keyed by project AND digest. A
 *   version never changes, so an entry is good for good, and a new publication
 *   is simply a new key.
 *
 * A miss (no binding, no pointer, unreadable content) is cached for the same
 * thirty seconds as the pointers, never for good: the bucket may simply not
 * have been written yet.
 *
 * Only a page that is not one of the club's own bundled docs gets here, so the
 * bundled pages keep their build-long cache lifetime.
 */

const SHORT = { stale: 15, revalidate: 30, expire: 30 } as const;

async function publishedPointers(): Promise<PublishedPointer[]> {
  "use cache";
  cacheLife(SHORT);
  const bucket = docsBucket();
  if (bucket === null) return [];
  const reserved = new Set(getDocsProjects().map((p) => p.slug));
  return listPublishedPointers(bucket, reserved);
}

async function publishedContent(
  slug: string,
  digest: string,
): Promise<PublishedContent | null> {
  "use cache";
  const bucket = docsBucket();
  const content = bucket
    ? await readContent(bucket, { project: slug, digest })
    : null;
  if (content === null) cacheLife(SHORT);
  else cacheLife("max");
  return content;
}

/**
 * The project published under `slug`, or null: not published yet, no bucket
 * here, or a version that fails validation.
 */
export async function getPublishedProject(
  slug: string,
): Promise<PublishedProject | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const pointer = (await publishedPointers()).find((p) => p.project === slug);
  if (!pointer) return null;
  const content = await publishedContent(slug, pointer.digest);
  return content ? buildPublishedProject(pointer, content) : null;
}

/** Every published project's pointer, for search and the sitemap. */
export async function getPublishedPointers(): Promise<PublishedPointer[]> {
  return publishedPointers();
}

const searchByDigest = new Map<string, PublishedSearchEntry[]>();
const SEARCH_MEMO_LIMIT = 100;

/**
 * A version's search entries. Memoised per isolate by digest (a version never
 * changes) rather than through the page cache: search is a route handler that
 * runs on every keystroke, not part of a cached page.
 */
export async function getPublishedSearchEntries(
  pointer: PublishedPointer,
): Promise<PublishedSearchEntry[]> {
  const key = `${pointer.project}/${pointer.digest}`;
  const known = searchByDigest.get(key);
  if (known) return known;
  const bucket = docsBucket();
  const entries = bucket ? await readSearch(bucket, pointer) : null;
  if (entries === null) return [];
  if (searchByDigest.size >= SEARCH_MEMO_LIMIT) searchByDigest.clear();
  searchByDigest.set(key, entries);
  return entries;
}
