/**
 * Production accounts: reading them, finding one by email, and creating the
 * ones a member list names but nobody has made yet.
 *
 * The query and the finder (`ugaEmail` first, then the sign-in address) live
 * in `@devdogsuga/events/imports`, shared with the platform console.
 *
 * Accounts are created through the Auth admin API, confirmed and with no
 * invite email, so the member's first sign-in with that address lands on an
 * account that already has their history. Nothing makes a profile when an
 * account is created; each caller inserts its own, with what it knows.
 */
import {
  ACCOUNTS_QUERY,
  accountFinder,
  accountRowFrom,
  createAccounts,
  type AccountRow,
  type CreateAccount,
} from "@devdogsuga/events/imports";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProductionError, withConnection, type Sql } from "./access.js";

/** {@link ACCOUNTS_QUERY} on an open connection. */
export async function accountsWith(sql: Sql): Promise<AccountRow[]> {
  const rows = await sql.unsafe(ACCOUNTS_QUERY);
  return rows.map(accountRowFrom);
}

export async function readAccounts(url: string): Promise<AccountRow[]> {
  return withConnection(
    url,
    "Could not read production's accounts",
    accountsWith,
  );
}

export type { CreateAccount };

export function createAccountFor(
  apiUrl: string,
  secretKey: string,
): CreateAccount {
  let client: Promise<SupabaseClient> | null = null;
  return async (email) => {
    client ??= import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(apiUrl, secretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }),
    );
    const { data, error } = await (
      await client
    ).auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) {
      throw new ProductionError(error?.message ?? "no user returned");
    }
    return data.user.id;
  };
}

export { accountFinder, createAccounts, type AccountRow };
