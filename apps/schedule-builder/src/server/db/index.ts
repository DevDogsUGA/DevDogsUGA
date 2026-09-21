import { createDb } from "@devdogsuga/drizzle";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { after } from "next/server";
import { env } from "~/env";
import { createScheduleBuilderDb, type ScheduleBuilderDb } from "./create";
import { relations } from "./relations";

export { createScheduleBuilderDb } from "./create";
type RequestContext = ReturnType<typeof getCloudflareContext>;

interface HyperdriveBinding {
  readonly connectionString: string;
}

/**
 * One database client per Worker invocation.
 *
 * OpenNext stores the current Cloudflare context in AsyncLocalStorage, so its
 * context object is a request identity. A WeakMap keeps the client stable for
 * every query and transaction in that request without retaining either after
 * the request becomes unreachable. This is the boundary direct Postgres.js
 * pools cannot cross in Workers.
 */
const requestDatabases = new WeakMap<RequestContext, ScheduleBuilderDb>();
let localDatabase: ScheduleBuilderDb | undefined;

function localDb(): ScheduleBuilderDb {
  return (localDatabase ??= createDb(env.DB_URL, relations));
}

function requestContext(): RequestContext | null {
  try {
    return getCloudflareContext();
  } catch {
    // `next build`, Node-based tests and scripts have no Worker request
    // context. They continue to use DB_URL and the development hot-reload cache
    // rather than requiring a remote Cloudflare binding.
    return null;
  }
}

function currentDb(): ScheduleBuilderDb {
  const context = requestContext();
  if (!context) return localDb();

  const hyperdrive = (context.env as { HYPERDRIVE?: HyperdriveBinding })
    .HYPERDRIVE;
  if (!hyperdrive && env.DEPLOY_ENV !== "development") {
    throw new Error(
      `The ${env.DEPLOY_ENV} schedule-builder Worker has no HYPERDRIVE binding.`,
    );
  }

  let database = requestDatabases.get(context);
  if (!database) {
    // Cloudflare recommends no more than five concurrent external connections
    // from one request. Hyperdrive owns the long-lived origin pool in deployed
    // environments; workerd preview uses DB_URL but keeps the same request
    // boundary so it can catch accidental cross-invocation reuse.
    database = createScheduleBuilderDb(
      hyperdrive?.connectionString ?? env.DB_URL,
      5,
    );
    requestDatabases.set(context, database);
    closeAfterResponse(database);
  }
  return database;
}

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
    // `after` throws outside a request scope. The context checks in currentDb
    // should prevent that; if it slips through, leave the pool to GC rather
    // than fail the query that needed it.
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
