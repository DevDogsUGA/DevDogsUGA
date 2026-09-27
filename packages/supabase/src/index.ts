/**
 * The repo's own Supabase data: the generated `Database` type and the app ->
 * Postgres schema map (`SCHEMAS`/`AppKey`/`SchemaName`).
 *
 * The client/server factories that used to live here (`createBrowserClient`,
 * `createServerClient`, `createAdminClient`) moved to `@devdogsuga/db`'s
 * `client`/`server` subpaths as part of the Backstage cutover: they are
 * framework, generic over any consumer's `Database` type, not this repo's
 * data. Import them from there and supply `Database` from this package (see
 * `./types` / `./schemas`) as the type argument.
 */
export type { Database } from "./database.types.js";
export { SCHEMAS, type AppKey, type SchemaName } from "./schemas.js";
