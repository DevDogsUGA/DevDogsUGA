import { createBrowserClient as ssrCreateBrowserClient, createServerClient as ssrCreateServerClient, } from "@supabase/ssr";
import { createClient as supabaseCreateClient, } from "@supabase/supabase-js";
export { SCHEMAS } from "./schemas";
/**
 * Browser (anon) client, scoped to `schema` as its default. Memoized by
 * `@supabase/ssr` on its arguments, so repeated calls return one instance.
 */
export function createBrowserClient(opts) {
    return ssrCreateBrowserClient(opts.url, opts.key, {
        db: { schema: opts.schema },
    });
}
/**
 * Cookie-backed server client (RSC / Route Handlers / Server Actions),
 * scoped to `schema`. The caller supplies the framework's cookie adapter.
 */
export function createServerClient(opts) {
    return ssrCreateServerClient(opts.url, opts.key, {
        db: { schema: opts.schema },
        cookies: opts.cookies,
    });
}
/**
 * Service-role admin client. Bypasses RLS — server-only, never ship to the
 * browser. Session auto-refresh/persistence are disabled.
 */
export function createAdminClient(opts) {
    const options = {
        db: { schema: opts.schema },
        auth: { autoRefreshToken: false, persistSession: false },
    };
    // supabase-js types the options' schema slot with a conditional that TS
    // can't collapse against a generic `S`; the runtime schema is correct
    // (db.schema === opts.schema) and the return type stays scoped to `S`.
    return supabaseCreateClient(opts.url, opts.key, options);
}
