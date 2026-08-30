import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

/**
 * The shared OpenNext -> Cloudflare config for every Next.js app in this repo.
 *
 * A bare `defineCloudflareConfig()` silently throws the entire prerender away,
 * and both apps shipped that way for months. The failure is invisible: the
 * build still produces every prerendered route, `deploy` still succeeds, and
 * the site still serves correct pages. They are just re-rendered from scratch
 * on every request.
 *
 * ## Why an incremental cache is not optional
 *
 * `defineCloudflareConfig()` defaults `incrementalCache` to `"dummy"`, whose
 * `get()` *throws*. Every prerendered route (PPR shells, `"use cache"` bodies,
 * plain static pages) is written to `.open-next/cache/` at build time, then
 * dropped twice over:
 *
 * 1. `populateCache` switches on the cache name and only uploads for R2, KV or
 *    static-assets; `"dummy"` hits the default branch and uploads nothing.
 * 2. At runtime every read throws, so the Worker re-renders instead.
 *
 * This bites even apps that do not use Cache Components. Fully static (`○`)
 * routes are *not* emitted as HTML into `.open-next/assets`. They go through
 * the incremental cache like everything else.
 *
 * ## Why R2 and not the alternatives
 *
 * - `static-assets` would need no infrastructure, but it hard-throws on the
 *   `composable` cache type, which is what Cache Components uses.
 * - KV is eventually consistent, which OpenNext explicitly recommends against.
 *
 * ## What is deliberately left as `"dummy"`
 *
 * **tagCache.** Nothing in this repo calls `revalidateTag`, and dummy is safe
 * here: `getLastModified` returns the entry's own `lastModified` (not `-1`) and
 * `isStale` returns `false`, so it never invalidates a live entry. D1 or a
 * Durable Object would add infrastructure to track tags nobody writes.
 *
 * ## Why the queue is NOT dummy (since 2026-08-20)
 *
 * `queue` used to be `"dummy"`, on the reasoning that content only changes on
 * deploy so nothing revalidates in place. That missed `cacheLife`: the
 * platform's profiles give routes revalidate windows (the build output's
 * `◐ / 15m`), so entries go STALE on a running deployment, and the dummy
 * queue's `send()` THROWS a FatalError. The first staging deployment served 500
 * on every `◐` route once its entries aged past their window, while
 * fully-dynamic routes kept working. The memory queue revalidates by
 * re-invoking the Worker through the `WORKER_SELF_REFERENCE` service binding,
 * so every OpenNext app's wrangler.jsonc must bind that to the SAME
 * environment's own worker name.
 *
 * ## Per-app wrangler config
 *
 * Each app needs its own R2 bucket bound as `NEXT_INC_CACHE_R2_BUCKET` (the
 * binding name is fixed by the adapter). `ensureR2Bucket` creates the bucket on
 * first deploy. Separate buckets rather than one shared one: buckets are free
 * and effectively unlimited, so per-app isolation and per-app dashboard metrics
 * cost nothing, and it avoids a `NEXT_INC_CACHE_R2_PREFIX` that has to stay
 * correct in every environment.
 *
 * > [!IMPORTANT]
 * > Nothing garbage-collects old entries. Cache keys are
 * > `${prefix}/${buildId}/${hash}.${cacheType}` and every deploy mints a new
 * > build id, so each deploy writes a fresh full copy and leaves the previous
 * > one behind forever. Set an R2 object lifecycle rule on each bucket (7-30
 * > days is plenty, entries are only useful for the current build).
 */
export function defineDevDogsCloudflareConfig() {
  return defineCloudflareConfig({
    // The regional cache puts a data-center-local Cache API layer in front of
    // R2, trading R2 Class B operations for local reads. The usual caveat, that
    // the Cache API can drift out of sync with R2, does not apply here: cache
    // keys include the build id, so a deploy changes every key rather than
    // mutating entries in place.
    incrementalCache: withRegionalCache(r2IncrementalCache, {
      mode: "long-lived",
    }),
    queue: memoryQueue,
  });
}
