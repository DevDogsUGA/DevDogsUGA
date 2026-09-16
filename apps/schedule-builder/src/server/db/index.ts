import { createDb } from "@devdogsuga/drizzle";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { env } from "~/env";
import { relations } from "./relations";

/**
 * Build a Drizzle client for a given connection string.
 *
 * Exported — unlike platform's module-private equivalent — because a Cloudflare
 * Workflow step runs with no OpenNext request context to key `currentDb()` on,
 * so the scrape Workflow constructs its own client directly from
 * `this.env.HYPERDRIVE.connectionString`.
 */
export function createScheduleBuilderDb(url: string, max?: number) {
  return createDb(url, relations, { cache: false, max });
}

type ScheduleBuilderDb = ReturnType<typeof createScheduleBuilderDb>;
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
  }
  return database;
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
