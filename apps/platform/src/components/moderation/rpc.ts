/**
 * The seam between this package and supabase-js.
 *
 * The *client* is typed structurally rather than by importing `SupabaseClient`,
 * for two reasons. Callers hold clients parameterised by their own app's schema
 * (`createBrowserClient({ schema: "forum" })`), so a nominal type would force
 * every call site to cast. And the contributor tooling builds throwaway clients
 * pointed at an arbitrary instance, which carry no `Database` generic at all.
 * Both satisfy the shape below, which is the only shape this package uses.
 *
 * The *call* is not structural. Argument names here are a by-name contract with
 * a Postgres function signature, and a typo surfaces at runtime as PostgREST
 * failing to find an overload rather than as a type error — which is why this
 * package used to carry a suite of tests doing nothing but pinning those names.
 * Generated types make that a compile error instead, so the tests are gone and
 * the guarantee is stronger: `Database["platform"]["Functions"]` comes from the
 * catalog, so it cannot drift from the SQL the way a hand-written wrapper could.
 */
import type { Database } from "@devdogsuga/supabase";

/** Every function in the `platform` schema, as generated from the database. */
type PlatformFunctions = Database["platform"]["Functions"];

/** The `{ data, error }` envelope every PostgREST call resolves to. */
interface RpcResponse {
  data: unknown;
  error: { message: string } | null;
}

interface SchemaClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>;
}

/** Any supabase-js client, however it was constructed or parameterised. */
export interface ModerationClient {
  schema(name: string): SchemaClient;
}

/** The schema every function in this package targets. */
const PLATFORM = "platform";

/**
 * Calls a `platform` RPC and returns its payload, or throws.
 *
 * PostgREST reports a raised exception as a resolved promise carrying an
 * `error`, so a caller who forgets to check it sees `undefined` rather than a
 * failure. Everything goes through here so that a `raise` in SQL surfaces as a
 * thrown `Error` in TypeScript, which is what callers already handle.
 *
 * The schema hop is here rather than at each call site because a consumer app's
 * client defaults to *its own* schema — the whole point of the arrangement is
 * that an app talks to `platform` without adopting it.
 *
 * Note the results are **arrays**: these functions are set-returning, so even a
 * logically-single result arrives as a one-element list.
 */
export async function callRpc<K extends keyof PlatformFunctions>(
  client: ModerationClient,
  fn: K,
  // A zero-argument function is generated as `Args: never`, not as an empty
  // object, so `{}` is not assignable to it and the argument has to disappear
  // entirely. The tuple-rest makes it conditionally absent; the `[T] extends
  // [never]` wrapping is what stops the conditional distributing over `never`
  // and collapsing to `never` on the true branch.
  ...rest: [PlatformFunctions[K]["Args"]] extends [never]
    ? []
    : [args: PlatformFunctions[K]["Args"]]
): Promise<PlatformFunctions[K]["Returns"]> {
  const { data, error } = await client.schema(PLATFORM).rpc(fn, rest[0]);
  if (error) {
    throw new Error(`platform.${String(fn)}() failed: ${error.message}`);
  }
  return data as PlatformFunctions[K]["Returns"];
}
