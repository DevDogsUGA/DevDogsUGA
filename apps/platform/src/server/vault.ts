import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * Supabase Vault, as four functions.
 *
 * **This file must never carry `"use server"`.** These were private to
 * `server/actions/credentials.ts` and had to move so the sandbox work could
 * reach them, but exporting them from a `"use server"` module is not the way:
 * every export there becomes a server action with an HTTP endpoint, so
 * `readVaultSecret` would become an endpoint that hands any browser any secret
 * by id.
 *
 * They live here instead, importable by server code and unreachable from a
 * client. The rule that makes that safe is that nothing in this file is
 * exported to a component; callers are server actions and loaders that have
 * already authorized the request.
 *
 * ## Why direct SQL and not the Supabase client
 *
 * These went through `supabaseAdmin.schema("vault")` until the Supabase OAuth
 * connect flow failed with `Invalid schema: vault`, PostgREST's PGRST106,
 * raised when a request names a schema it does not serve. `vault` is not in
 * `config.toml`'s `[api].schemas` and has never been, so **every one of these
 * calls had always failed**; nothing had exercised them end to end.
 *
 * Adding `vault` to that list would have been the wrong repair. It publishes
 * `vault.decrypted_secrets` over the REST API, one missing grant away from
 * handing out every credential the platform holds. Supabase does not expose
 * Vault over the API for that reason; the Vault is meant to be reached from
 * inside Postgres.
 *
 * `DB_URL` connects as `postgres`, which owns the vault schema, so direct SQL
 * needs no new privilege and exposes nothing new over the API.
 *
 * > **Measured** against the linked project: `supabase_vault` 0.3.1 is
 * > installed, `vault.create_secret` and the `vault.decrypted_secrets` view
 * > both exist, and a write / read-back / delete round-trip as this role
 * > succeeds.
 */

/** Store a secret and return its id. The plaintext is never readable again. */
export async function storeVaultSecret(
  secret: string,
  name: string,
): Promise<string> {
  const [row] = await db.execute<{ id: string }>(
    sql`select vault.create_secret(${secret}, ${name}) as id`,
  );
  if (!row?.id) throw new Error(`Failed to store secret "${name}"`);
  return row.id;
}

/** Null rather than throwing: a missing secret is a normal state after teardown. */
export async function readVaultSecret(
  secretId: string,
): Promise<string | null> {
  const [row] = await db.execute<{ decrypted_secret: string | null }>(
    sql`select decrypted_secret from vault.decrypted_secrets where id = ${secretId}::uuid`,
  );
  return row?.decrypted_secret ?? null;
}

/**
 * By name rather than by id, for secrets a human writes into the Vault by hand.
 *
 * Vault names are unique, so the name is a stable handle that survives
 * rotation: replacing the row's value changes nothing else. An id stored in an
 * env var would instead go stale the moment a rotation created a new row.
 */
export async function readVaultSecretByName(
  name: string,
): Promise<string | null> {
  const [row] = await db.execute<{ decrypted_secret: string | null }>(
    sql`select decrypted_secret from vault.decrypted_secrets where name = ${name}`,
  );
  return row?.decrypted_secret ?? null;
}

export async function deleteVaultSecret(secretId: string): Promise<void> {
  await db.execute(sql`delete from vault.secrets where id = ${secretId}::uuid`);
}
