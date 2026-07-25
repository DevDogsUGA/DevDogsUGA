# Caching Strategy

This project uses Next.js [Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) (`cacheComponents: true` in `next.config.ts`) for granular server-side caching. This enables the `"use cache"` directive, `cacheLife()`, `cacheTag()`, and Partial Prerendering (PPR).

## How `"use cache"` works

Functions and components marked with `"use cache"` have their results cached across requests. The cache key is derived from the function's arguments and source location. Two APIs control cache behavior:

- **`cacheLife(profile)`** — sets the TTL. Accepts named presets (`"seconds"`, `"minutes"`, `"hours"`, `"days"`, `"weeks"`, `"max"`) or custom objects.
- **`cacheTag(tag)`** — associates the cache entry with a tag for on-demand invalidation via `revalidateTag(tag)`.

See the [Next.js `"use cache"` reference](https://nextjs.org/docs/app/api-reference/directives/use-cache) for full documentation.

## Cache tag registry

All cache tag strings are defined as top-level functions in `src/server/manifest/cache-tags.ts`:

```ts
docsFileSearchTag({ repo, branch, slug }); // per-file doc entries
docsTreeTag({ repo, branch }); // per-branch file tree
docsBranchesTag({ repo }); // per-repo branch list
docsSearchIndexTag({ repo }); // per-repo search index
```

Both `cacheTag()` (in `"use cache"` functions) and `revalidateTag()` (in the webhook handler) import from this module. A typo or rename becomes a compile-time error.

## Four-layer docs cache

Documentation content is cached at four levels of granularity. Each layer is a `"use cache"` function in `src/server/manifest/docs-cache.ts`:

### Layer 1: Per-file doc entries

`getDocFileEntries(repo, branch, slug)` — caches one markdown file's parsed title, description, headings (with depth), breadcrumbs, and URL. Consumers: search index, page TOC.

### Layer 2: Per-branch doc tree

`getDocTreeCached(repo, branch)` — caches the file tree structure (which files exist, folder hierarchy, meta.json ordering). Used by the sidebar to build the page tree.

### Layer 3: Per-repo branch list

`getDocBranchesCached(repo)` — caches the list of branches and which is the default.

### Layer 4: Per-repo search index (composite)

`getDocsSearchIndex(repo)` — calls Layers 2 and 1 to assemble a flat array of `DocPageEntry[]` for the search API. Since inner calls are independently cached, only invalidated pieces recompute when this layer rebuilds.

## Cache invalidation

A GitHub webhook (`POST /api/github/docs-webhook`) fires on every push. The handler in `src/server/docs/revalidate.ts` determines which tags to invalidate based on which files changed:

- **Modified file** → invalidates that file's search tag + the repo's search index
- **Added/removed file** → also invalidates the branch tree tag
- **meta.json changed** → invalidates the branch tree tag

The `searchIndex` tag is always invalidated alongside file-level changes so the composite index rebuilds. Unaffected files' entries stay cached.

## Cached pages

### Doc pages (`/docs/[...path]`)

Each doc page uses `"use cache"` at the page level, caching the entire rendered RSC payload. Tag-based invalidation on push ensures pages update immediately when content changes.

### Static pages

Pages with no dynamic data use `"use cache"` to enable static prerendering:

- `/` (homepage), `/community`, `/events`, `/partners`, `/legal/privacy`

These are effectively static — they rebuild only on deploy or when the cache expires.

## What is NOT cached

User-specific data (profile, permissions, verification, roles) runs fresh per-request. These queries live inside `<Suspense>` boundaries so they don't block the static shell from rendering.

The search API route (`/api/search`) fetches user permissions fresh per-request for filtering, but reads doc entries from the cached search index.

[Vercel Edge Config](https://vercel.com/docs/edge-config) is used for the documentation repo list — reads are ~1ms from CDN.

## PPR interaction

With PPR, the static shell of a page is prerendered and served from CDN. Dynamic holes (wrapped in `<Suspense>`) stream in as they resolve. For the navigation, this means the sidebar chrome renders instantly while user data streams in.

See [Navigation System](navigation) for the full PPR architecture.
