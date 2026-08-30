// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  deleteVaultSecret,
  readVaultSecret,
  readVaultSecretByName,
  storeVaultSecret,
} from "~/server/vault";

/**
 * A round trip through the real Vault.
 *
 * This test exists because these four functions were broken for their entire
 * life and nothing noticed. They went through `supabaseAdmin.schema("vault")`,
 * and `vault` is not in `config.toml`'s `[api].schemas`, so PostgREST answered
 * every call with `Invalid schema: vault`. It surfaced only when the Supabase
 * OAuth callback tried to store a grant in front of a person.
 *
 * The unit tests could not have caught it. Every caller mocks this module, and
 * a mock of a function that never worked passes as well as a mock of one that
 * does. Only a test that talks to a real Vault tells them apart, which is why
 * it lives in the `.db-test` suite.
 */

const NAME = `vault_db_test_${Date.now()}`;
const PLAINTEXT = "correct horse battery staple";

let storedId: string | undefined;

afterAll(async () => {
  await db.execute(
    sql`delete from vault.secrets where name like 'vault_db_test_%'`,
  );
});

describe("the Vault round trip", () => {
  it("stores a secret and returns its id", async () => {
    storedId = await storeVaultSecret(PLAINTEXT, NAME);
    expect(storedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("reads the plaintext back by id", async () => {
    await expect(readVaultSecret(storedId!)).resolves.toBe(PLAINTEXT);
  });

  it("reads the plaintext back by name", async () => {
    await expect(readVaultSecretByName(NAME)).resolves.toBe(PLAINTEXT);
  });

  it("stores ciphertext, not the plaintext", async () => {
    // The point of the Vault. If this ever passes trivially, because the column
    // holds the plaintext, the encryption is not doing anything.
    const [row] = await db.execute<{ secret: string }>(
      sql`select secret from vault.secrets where id = ${storedId!}::uuid`,
    );
    expect(row!.secret).not.toBe(PLAINTEXT);
    expect(row!.secret).not.toContain("horse");
  });

  it("returns null for an id that is not there", async () => {
    await expect(
      readVaultSecret("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBeNull();
  });

  it("returns null for a name that is not there", async () => {
    await expect(readVaultSecretByName("no_such_secret")).resolves.toBeNull();
  });

  it("deletes, and the secret stops resolving", async () => {
    await deleteVaultSecret(storedId!);
    await expect(readVaultSecret(storedId!)).resolves.toBeNull();
    await expect(readVaultSecretByName(NAME)).resolves.toBeNull();
  });

  it("deleting an absent id is not an error", async () => {
    // Teardown calls this for rows that a previous partial teardown may already
    // have removed; throwing there would strand the rest of the cleanup.
    await expect(
      deleteVaultSecret("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBeUndefined();
  });
});

describe("the schema the API actually serves", () => {
  it("does not expose vault over PostgREST", async () => {
    // A guard on the repair, not on the bug. Adding `vault` to `[api].schemas`
    // would make the original code work again, and would also expose
    // `decrypted_secrets` over REST, one missing grant away from handing out
    // every credential the platform holds.
    const [row] = await db.execute<{ setting: string | null }>(
      sql`select current_setting('pgrst.db_schemas', true) as setting`,
    );
    const schemas = row?.setting;
    if (schemas === null || schemas === undefined) return; // not set locally
    expect(schemas.split(",").map((s) => s.trim())).not.toContain("vault");
  });
});
