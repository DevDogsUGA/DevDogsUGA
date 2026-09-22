import { createDb } from "@devdogsuga/drizzle";
import { env as workerEnv } from "cloudflare:workers";
import { cacheForRequest } from "vinext/cache";
import { after } from "next/server";
import { env } from "~/env";
import { createScheduleBuilderDb, type ScheduleBuilderDb } from "./create";
import { relations } from "./relations";

export { createScheduleBuilderDb } from "./create";

function localDb(): ScheduleBuilderDb {
  return createDb(env.DB_URL, relations);
}

/**
 * One database client per Worker invocation.
 *
 * `cacheForRequest` keys its cache on this factory's own identity against
 * vinext's per-request store (an `AsyncLocalStorage`-backed context, torn
 * down once the request's async continuations finish), so calling `currentDb()`
 * more than once inside the same request reuses the same client instead of
 * opening a fresh Postgres.js pool per query. Outside a request scope (tests,
 * build-time module evaluation) it runs on every call with no caching -- see
 * `vinext/cache`'s own doc comment. This is the boundary direct Postgres.js
 * pools cannot cross in Workers.
 */
const currentDb = cacheForRequest((): ScheduleBuilderDb => {
  const hyperdrive = workerEnv.HYPERDRIVE;
  if (!hyperdrive) {
    if (env.DEPLOY_ENV !== "development") {
      throw new Error(
        `The ${env.DEPLOY_ENV} schedule-builder Worker has no HYPERDRIVE binding.`,
      );
    }
    // No HYPERDRIVE binding in the development environment's wrangler.jsonc
    // block (see there); fall back to DB_URL the same way local `next
    // dev`/`wrangler dev` always has.
    return localDb();
  }

  // Cloudflare recommends no more than five concurrent external connections
  // from one request. Hyperdrive owns the long-lived origin pool in deployed
  // environments.
  const database = createScheduleBuilderDb(hyperdrive.connectionString, 5);
  closeAfterResponse(database);
  return database;
});

/**
 * Close the request's postgres.js pool once the response has been sent.
 *
 * A pool cannot be reused across invocations -- workerd forbids using one
 * request's socket in another -- so a fresh client is minted per request. Left
 * unclosed, each abandoned pool (its sockets, buffers and lifetime timers)
 * lingers on the isolate heap until GC, and under sustained traffic the isolate
 * climbs past its 128 MB ceiling and is killed mid-request ("Worker exceeded
 * memory limit"). `after` runs the close once the response has streamed, when
 * every query has settled, and fires even on `redirect`/`notFound`/errors; on
 * Cloudflare it is backed by `ctx.waitUntil`. This is the pattern Cloudflare
 * documents for Hyperdrive + postgres.js.
 */
function closeAfterResponse(database: ScheduleBuilderDb): void {
  try {
    after(async () => {
      try {
        await database.$client.end({ timeout: 5 });
      } catch {
        // A pool that never opened a socket, or already closed, is fine.
      }
    });
  } catch {
    // `after` throws outside a request scope. `closeAfterResponse` is only
    // ever reached from inside `currentDb`'s Hyperdrive branch, which only
    // runs with a live HYPERDRIVE binding (never in the request-less
    // fallback); if a scope slips through anyway, leave the pool to GC
    // rather than fail the query that needed it.
  }
}

/**
 * Existing callers import a Drizzle object, so keep that API while resolving the
 * backing object lazily for the current request. Binding methods to the
 * concrete Drizzle instance preserves methods such as `transaction` that may
 * rely on their receiver.
 */
export const db = new Proxy({} as ScheduleBuilderDb, {
  get(_target, property): unknown {
    const database = currentDb();
    const value: unknown = Reflect.get(database, property, database);
    return typeof value === "function"
      ? (...args: unknown[]): unknown =>
          Reflect.apply(value, database, args) as unknown
      : value;
  },
});
