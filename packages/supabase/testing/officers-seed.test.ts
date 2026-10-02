/**
 * The account-matching logic in `supabase/seed/officers/*.sql`.
 *
 * Each seed matches its officer to `auth.users` by primary email or any
 * altEmail, case-insensitively, and that match has to survive being replayed
 * against a target that already has state on it, not only through a `db
 * reset` that starts from an empty `auth.users`. These cases exercise the
 * files themselves (`sql().file(...)`) rather than reimplementing their SQL
 * in TypeScript.
 *
 * Requires the local stack, already reset (`pnpm devtools db reset`) so the
 * officers are seeded once before any of these run -- that first pass is what
 * makes every officer's container "officer-linked" going in, which is the
 * precondition the collision and no-op cases below are about.
 *
 * Run via `pnpm --filter @devdogsuga/supabase test:rls`.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "./personas";

const OFFICERS_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "supabase",
  "seed",
  "officers",
);

const SEED_FILES = readdirSync(OFFICERS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => join(OFFICERS_DIR, name));

/**
 * Runs every officer seed file in order, the way `supabase db reset` does.
 *
 * Each file itself opens with `begin;` and closes with `commit;` -- required
 * so a RAISE partway through rolls back everything, per its own header. Sent
 * over the shared pool (`sql()`, `max: 2`), postgres.js refuses that as
 * `UNSAFE_TRANSACTION`: a connection returned to the pool mid-transaction
 * would leak that state into whichever query runs next on it. A reserved
 * connection sidesteps that -- it is not returned to the pool until released,
 * so the file's own BEGIN/COMMIT (or the rollback a RAISE forces) can
 * only ever affect this one call.
 */
async function runSeed(): Promise<void> {
  const reserved = await sql().reserve();
  try {
    for (const file of SEED_FILES) await reserved.file(file);
  } catch (error) {
    // A RAISE aborts the file's `begin;` without ever reaching its trailing
    // `commit;` (multi-statement batches stop dead on the first error), so
    // the connection comes back still inside a failed transaction. Clear it
    // before this connection returns to the pool, or the next query anyone
    // sends down it fails with "current transaction is aborted" instead of
    // whatever it actually asked for.
    await reserved`rollback`;
    throw error;
  } finally {
    reserved.release();
  }
}

/**
 * A stable projection of `platform.profile`, excluding
 * "involvementImportedAt" -- which the seed's own header documents as
 * refreshed on every replay by design, unrelated to account matching -- so a
 * no-op replay produces an identical snapshot.
 */
async function profileSnapshot() {
  return sql()`
    select
      "userId", "preferredName", bio, pronouns, "graduationSemester",
      "graduationYear", "showGithub", "showLinkedin", "roleDescription",
      "ugaEmail", "legalFirstName", "legalLastName"
    from platform.profile
    order by "userId"
  `;
}

describe("officer seeds account matching", () => {
  it("replaying an already-seeded database is a no-op", async () => {
    const before = await profileSnapshot();
    await runSeed();
    const after = await profileSnapshot();

    expect(after).toEqual(before);

    const { count } = (
      await sql()`select count(*)::int as count from platform.profile`
    )[0] as { count: number };
    expect(count).toBe(11); // one per officer file
  });

  describe("a real account later matching an officer's altEmail", () => {
    // Jack Harrington's seeded container id and the altEmail his real row
    // gets matched under, per supabase/seed/officers/jack-harrington.sql.
    const CONTAINER_ID = "00000000-0000-4000-b000-000000000001";
    const PRIMARY_EMAIL = "jbh36784@uga.edu";
    const ALT_EMAIL = "jackharrington290@gmail.com";
    let scratchId: string | undefined;

    afterEach(async () => {
      if (scratchId) {
        await sql()`delete from auth.users where id = ${scratchId}`;
        scratchId = undefined;
      }
    });

    it("keeps the already-linked container, not the new row", async () => {
      const [before] = await sql()`
        select "userId" from platform.profile where "ugaEmail" = ${PRIMARY_EMAIL}
      `;
      expect(before?.userId).toBe(CONTAINER_ID);

      const inserted = await sql()`
        insert into auth.users (
          id, instance_id, aud, role, email,
          raw_app_meta_data, raw_user_meta_data,
          confirmation_token, recovery_token,
          email_change_token_new, email_change,
          created_at, updated_at
        ) values (
          gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', ${ALT_EMAIL},
          '{}'::jsonb, '{}'::jsonb, '', '', '', '', now(), now()
        )
        returning id
      `;
      scratchId = inserted[0]!.id as string;

      await runSeed();

      const [after] = await sql()`
        select "userId" from platform.profile where "ugaEmail" = ${PRIMARY_EMAIL}
      `;
      expect(after?.userId).toBe(CONTAINER_ID);

      const [scratchProfile] = await sql()`
        select 1 from platform.profile where "userId" = ${scratchId}
      `;
      expect(scratchProfile).toBeUndefined();

      const { count } = (
        await sql()`select count(*)::int as count from platform.profile`
      )[0] as { count: number };
      expect(count).toBe(11); // one per officer file
    });
  });

  describe("two distinct accounts matching one officer's altEmails", () => {
    // Shruti Mishra: the one officer seeded with two altEmails, neither of
    // which is her primary address, so both can be matched independently
    // without ever tying on the primary-email tiebreak.
    const SLUG = "shruti-mishra";
    const CONTAINER_ID = "00000000-0000-4000-b000-000000000004";
    const ALT_EMAIL_A = "shruti.mishra@uga.edu";
    const ALT_EMAIL_B = "shrutibmishra1@gmail.com";

    let scratchIds: string[] = [];

    afterEach(async () => {
      for (const id of scratchIds) {
        await sql()`delete from auth.users where id = ${id}`;
      }
      scratchIds = [];

      // Whether or not the container still exists at this point, replaying
      // the seed is what puts Shruti back exactly where `db reset` left her
      // -- container, profile, academic programs and role assignment alike
      // -- rather than hand-restoring each cascaded table here and risking
      // this cleanup itself drifting from what the seed actually writes.
      await runSeed();
    });

    it("raises, naming the officer and the matched addresses, and rolls back", async () => {
      const [user] = await sql()`
        select 1 from auth.users where id = ${CONTAINER_ID}
      `;
      const [profile] = await sql()`
        select 1 from platform.profile where "userId" = ${CONTAINER_ID}
      `;
      expect(user).toBeDefined();
      expect(profile).toBeDefined();

      // Removing the container (and the profile that cascades from it) puts
      // Shruti back into "never resolved" state, the precondition for two
      // fresh accounts to tie. `afterEach` above replays the seed to recreate
      // her regardless of how this test finishes.
      await sql()`delete from auth.users where id = ${CONTAINER_ID}`;

      const inserted = await sql()`
        insert into auth.users (
          id, instance_id, aud, role, email,
          raw_app_meta_data, raw_user_meta_data,
          confirmation_token, recovery_token,
          email_change_token_new, email_change,
          created_at, updated_at
        )
        select
          gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', email,
          '{}'::jsonb, '{}'::jsonb, '', '', '', '', now(), now()
        from unnest(array[${ALT_EMAIL_A}, ${ALT_EMAIL_B}]::text[]) as email
        returning id
      `;
      scratchIds = inserted.map((row) => row.id as string);
      expect(scratchIds).toHaveLength(2);

      const before = await profileSnapshot();

      let raised: Error | undefined;
      try {
        await runSeed();
      } catch (error) {
        raised = error as Error;
      }
      expect(raised).toBeDefined();
      expect(raised?.message).toContain(SLUG);
      expect(raised?.message).toContain(ALT_EMAIL_A);
      expect(raised?.message).toContain(ALT_EMAIL_B);
      // Never the other side: nothing about the matched rows themselves
      // (their generated ids) belongs in the error.
      expect(raised?.message).not.toContain(scratchIds[0]);
      expect(raised?.message).not.toContain(scratchIds[1]!);

      // Her file runs in one transaction: the RAISE rolls back every write it
      // made. Other officers' files are no-ops on a replay, so nothing moves.
      const after = await profileSnapshot();
      expect(after).toEqual(before);
    });
  });
});
