import { createDb } from "@devdogsuga/drizzle";
import { relations } from "./relations";

/**
 * Build a cache-less Drizzle client for an explicit connection string.
 *
 * Keep this module free of `~/env` and OpenNext imports: the Cloudflare
 * Workflow entrypoint is evaluated when a Worker version is uploaded, outside
 * Next's build-time replacement of `NEXT_PUBLIC_*` variables. Importing the
 * request-scoped database module from that eager graph would therefore run the
 * app's full environment schema before the Worker can start.
 */
export function createScheduleBuilderDb(url: string, max?: number) {
  return createDb(url, relations, { cache: false, max });
}

export type ScheduleBuilderDb = ReturnType<typeof createScheduleBuilderDb>;
