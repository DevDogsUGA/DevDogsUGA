import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";

/**
 * The shared OpenNext -> Cloudflare config for every Next.js app in this repo.
 *
 * This exists because the default — a bare `defineCloudflareConfig()` — silently
 * throws the entire prerender away, and both apps shipped that way for months
 * without anyone noticing. The failure is invisible: the build still produces
 * every prerendered route, `deploy` still succeeds, and the site still serves
 * correct pages. They are just re-rendered from scratch on every single request.
 *
 * ## Why an incremental cache is not optional
 *
 * `defineCloudflareConfig()` defaults `incrementalCache` to `"dummy"`, whose
 * `get()` *throws*. Every prerendered route — PPR shells, `"use cache"` bodies,
 * and plain static pages alike — is written to `.open-next/cache/` at build
 * time, then dropped on the floor twice over:
 *
 * 1. `populateCache` switches on the cache name and only uploads for R2, KV or
 *    static-assets; `"dummy"` hits the default branch and uploads nothing.
 * 2. At runtime every read throws, so the Worker re-renders instead.
 *
 * Note this bites even apps that do not use Cache Components. Fully static
 * (`○`) routes are *not* emitted as HTML into `.open-next/assets` — they go
 * through the incremental cache like everything else.
 *
 * ## Why R2 and not the alternatives
 *
 * - `static-assets` would need no infrastructure at all, but it hard-throws on
 *   the `composable` cache type, which is what Cache Components uses.
 * - KV is eventually consistent, which OpenNext explicitly recommends against.
 *
 * ## What is deliberately left as `"dummy"`
 *
 * - **tagCache.** Nothing in this repo calls `revalidateTag`. The dummy
 *   implementation is benign rather than merely unused: `getLastModified`
 *   returns the entry's own `lastModified` (not `-1`) and `isStale` returns
 *   `false`, so it never invalidates a live entry. Wiring up D1 or a Durable
 *   Object would add infrastructure to track tags nobody writes.
 * - **queue.** Background ISR revalidation. Content here only changes on
 *   deploy, and a new deploy mints a new build id (which is part of every cache
 *   key), so there is nothing to revalidate in place. This is also why no
 *   `WORKER_SELF_REFERENCE` service binding is needed — that binding exists for
 *   the queue and the Pages-Router `res.revalidate()` patch, not for the cache.
 *
 * ## Per-app wrangler config
 *
 * Each app needs its own R2 bucket bound as `NEXT_INC_CACHE_R2_BUCKET` (the
 * binding name is fixed by the adapter). The bucket is created automatically on
 * first deploy via `ensureR2Bucket`. Separate buckets rather than one shared
 * one: buckets are free and effectively unlimited, so per-app isolation and
 * per-app dashboard metrics cost nothing, and it avoids a
 * `NEXT_INC_CACHE_R2_PREFIX` that has to stay correct in every environment.
 *
 * > [!IMPORTANT]
 * > Nothing garbage-collects old entries. Cache keys are
 * > `${prefix}/${buildId}/${hash}.${cacheType}` and every deploy mints a new
 * > build id, so each deploy writes a fresh full copy and leaves the previous
 * > one behind forever. Set an R2 object lifecycle rule on each bucket
 * > (7-30 days is plenty — entries are only useful for the current build).
 */
export function defineDevDogsCloudflareConfig() {
  return defineCloudflareConfig({
    // Wrapping R2 in the regional cache puts a data-center-local Cache API
    // layer in front of it, trading R2 Class B operations for local reads. The
    // usual caveat — that the Cache API can drift out of sync with R2 — does
    // not apply here: cache keys include the build id, so a deploy changes
    // every key rather than mutating entries in place.
    incrementalCache: withRegionalCache(r2IncrementalCache, {
      mode: "long-lived",
    }),
  });
}
