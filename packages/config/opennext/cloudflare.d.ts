import type { OpenNextConfig } from "@opennextjs/cloudflare";

/**
 * The shared OpenNext -> Cloudflare config for every Next.js app in this repo.
 *
 * Wires up the R2 incremental cache, without which the entire prerender is
 * discarded and every route re-renders per request. See the implementation for
 * the full rationale.
 */
export declare function defineDevDogsCloudflareConfig(): OpenNextConfig;
