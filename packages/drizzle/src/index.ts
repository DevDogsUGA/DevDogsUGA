import type { AnyRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * The connection options every app shares.
 *
 * `prepare: false` is required, not a preference: the apps connect through
 * Supabase's transaction-mode pooler, which hands a different backend to each
 * transaction and therefore cannot keep a named prepared statement alive
 * between them.
 */
const CONNECTION_OPTIONS = { prepare: false } as const;

/**
 * Connections are cached on `globalThis` so Next's dev-server module reloads
 * reuse one pool instead of opening a new one per edit. Keyed by URL rather
 * than stored under a bare `conn`: this factory is called by more than one
 * package now, and an unkeyed slot would let the second caller silently
 * inherit the first caller's connection — including its database.
 */
const CACHE_KEY = Symbol.for("@devdogsuga/drizzle.connections");

type ConnectionCache = Map<string, ReturnType<typeof postgres>>;

function connectionCache(): ConnectionCache {
  const g = globalThis as unknown as Record<
    symbol,
    ConnectionCache | undefined
  >;
  return (g[CACHE_KEY] ??= new Map());
}

export interface CreateDbOptions {
  /**
   * Whether to cache the connection on `globalThis`. Defaults to true outside
   * production, matching the previous per-app behaviour: in production the
   * module graph is built once, so the cache buys nothing and only keeps a
   * reference alive.
   */
  cache?: boolean;
}

/**
 * Builds the Drizzle client for an app.
 *
 * Each app passes its own generated `relations`, because the two introspect
 * different Postgres schemas and their generated modules are not
 * interchangeable. Everything else — driver, pooling behaviour, hot-reload
 * caching — lives here so it can only be configured one way.
 */
export function createDb<TRelations extends AnyRelations>(
  url: string,
  relations: TRelations,
  { cache = process.env.NODE_ENV !== "production" }: CreateDbOptions = {},
) {
  const cached = cache ? connectionCache().get(url) : undefined;
  const client = cached ?? postgres(url, CONNECTION_OPTIONS);

  if (cache && !cached) connectionCache().set(url, client);

  return drizzle({ client, relations });
}
