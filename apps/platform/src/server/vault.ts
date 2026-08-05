import { supabaseAdmin } from "~/supabase/admin";

/**
 * Supabase Vault, as three functions.
 *
 * **This file must never carry `"use server"`.** These were private to
 * `server/actions/credentials.ts` and had to move so the sandbox work could
 * reach them, but exporting them from a `"use server"` module is not the way:
 * every export there becomes a server action with an HTTP endpoint, so
 * `readVaultSecret` would become "hand any browser any secret by id" — the
 * single worst endpoint this codebase could publish.
 *
 * They live here instead, importable by server code and unreachable from a
 * client. The rule that makes that safe is that nothing in this file is
 * exported to a component; callers are server actions and loaders that have
 * already authorized the request.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

/** Store a secret and return its id. The plaintext is never readable again. */
export async function storeVaultSecret(
  secret: string,
  name: string,
): Promise<string> {
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .schema("vault")
    .from("secrets")
    .insert({ secret, name })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(
      `Failed to store secret: ${String((error as { message?: string } | null)?.message)}`,
    );
  }
  return (data as { id: string }).id;
}

/** Null rather than throwing: a missing secret is a normal state after teardown. */
export async function readVaultSecret(
  secretId: string,
): Promise<string | null> {
  const admin = supabaseAdmin as any;
  const { data, error } = await admin
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("id", secretId)
    .single();
  if (error || !data) return null;
  return (data as { decrypted_secret: string }).decrypted_secret;
}

export async function deleteVaultSecret(secretId: string): Promise<void> {
  const admin = supabaseAdmin as any;
  await admin.schema("vault").from("secrets").delete().eq("id", secretId);
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
