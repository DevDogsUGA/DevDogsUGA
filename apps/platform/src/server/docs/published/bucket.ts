import { env as workerEnv } from "cloudflare:workers";

/** The slice of an R2 bucket the reader uses: reads and listings, nothing that writes. */
export type DocsBucket = NonNullable<typeof workerEnv.PROJECT_DOCS>;

/**
 * The published-docs bucket, or null when the binding isn't there (local dev
 * and tests without one, or a deployment before the bucket exists). Callers
 * treat null as "nothing is published", never as an error.
 */
export function docsBucket(): DocsBucket | null {
  return workerEnv.PROJECT_DOCS ?? null;
}
