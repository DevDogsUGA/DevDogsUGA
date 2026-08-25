import {
  createBrowserClient as ssrCreateBrowserClient,
  createServerClient as ssrCreateServerClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import {
  createClient as supabaseCreateClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

export type { Database };
export { SCHEMAS, type AppKey, type SchemaName } from "./schemas.js";

/**
 * Any schema exposed by the shared Supabase project's generated types.
 *
 * `Database` carries a generated `__InternalSupabase` key (PostgREST version
 * metadata) that is not a real schema; the supabase-js/ssr client generics
 * constrain their schema parameter with the same `Omit`, so stripping it here
 * keeps `S` assignable to them.
 */
export type DatabaseSchema = keyof Omit<Database, "__InternalSupabase"> &
  string;

interface ClientOptions<S extends DatabaseSchema> {
  /** Supabase API URL (e.g. `env.API_URL` / `env.NEXT_PUBLIC_SUPABASE_URL`). */
  url: string;
  /** Publishable/anon key for browser & server clients; secret key for admin. */
  key: string;
  /** The app's Postgres schema — becomes the client's default for `.from()`. */
  schema: S;
}

/**
 * Browser (anon) client, scoped to `schema` as its default.
 *
 * `@supabase/ssr` caches this in the browser, but NOT on the arguments: it
 * keeps ONE module-level slot and returns whatever landed there first, without
 * comparing url, key or schema. So a second call with a different `schema`
 * silently hands back the first client, still pointed at the first schema.
 *
 * That is survivable here only because each app runs in its own page and calls
 * this with one schema — the constant from its own `./schema`. Calling it with
 * two different schemas in one app would not fail; it would quietly query the
 * wrong one. Use a separate client from `@supabase/supabase-js` if a second
 * schema is ever genuinely needed on the client.
 */
export function createBrowserClient<S extends DatabaseSchema>(
  opts: ClientOptions<S>,
) {
  return ssrCreateBrowserClient<Database, S>(opts.url, opts.key, {
    db: { schema: opts.schema },
  });
}

/**
 * Cookie-backed server client (RSC / Route Handlers / Server Actions),
 * scoped to `schema`. The caller supplies the framework's cookie adapter.
 */
export function createServerClient<S extends DatabaseSchema>(
  opts: ClientOptions<S> & { cookies: CookieMethodsServer },
) {
  return ssrCreateServerClient<Database, S>(opts.url, opts.key, {
    db: { schema: opts.schema },
    cookies: opts.cookies,
  });
}

/**
 * Service-role admin client. Bypasses RLS — server-only, never ship to the
 * browser. Session auto-refresh/persistence are disabled.
 */
export function createAdminClient<S extends DatabaseSchema>(
  opts: ClientOptions<S>,
) {
  const options: SupabaseClientOptions<S> = {
    db: { schema: opts.schema },
    auth: { autoRefreshToken: false, persistSession: false },
  };
  // supabase-js types the options' schema slot with a conditional that TS
  // can't collapse against a generic `S`; the runtime schema is correct
  // (db.schema === opts.schema) and the return type stays scoped to `S`.
  return supabaseCreateClient<Database, S>(
    opts.url,
    opts.key,
    options as never,
  );
}
