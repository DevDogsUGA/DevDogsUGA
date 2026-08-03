/**
 * The seam between this package and supabase-js.
 *
 * Typed structurally rather than by importing `SupabaseClient`, for two
 * reasons. Callers hold clients parameterised by their own app's schema
 * (`createBrowserClient({ schema: "forum" })`), so a nominal type would force
 * every call site to cast. And the contributor tooling builds throwaway clients
 * pointed at an arbitrary instance, which carry no `Database` generic at all.
 * Both satisfy the shape below, which is the only shape this package uses.
 */

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
 * failure. Every wrapper goes through here so that a `raise` in SQL surfaces as
 * a thrown `Error` in TypeScript, which is what callers already handle.
 *
 * The schema hop is here rather than at each call site because a consumer app's
 * client defaults to *its own* schema — the whole point of the arrangement is
 * that an app talks to `platform` without adopting it.
 */
export async function callRpc<T>(
  client: ModerationClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.schema(PLATFORM).rpc(fn, args);
  if (error) {
    throw new Error(`platform.${fn}() failed: ${error.message}`);
  }
  return data as T;
}
