// @vitest-environment node
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "~/server/db";

/**
 * The schema-wide function-privilege posture `20260829080000_27_platform_close_public_execute.sql`
 * establishes: PUBLIC holds no EXECUTE anywhere in `platform`, on functions that
 * exist today or are created later, while the three API roles keep theirs.
 *
 * These three checks used to live beside `resolve_sandbox_credential`, the
 * function whose narrow-role grant first exposed the gap this migration closes
 * (see its own comment for the story). The sandbox integration is gone, but the
 * posture it exposed is a property of the whole schema, not of that one
 * function, so the regression guards moved here rather than leaving with it.
 */
describe("platform schema function grants", () => {
  it("keeps PUBLIC off the schema's function surface", async () => {
    // The regression guard. A new function created without an explicit grant
    // policy would show up here, and would be reachable by every custom role in
    // the cluster.
    //
    // `coalesce(proacl, acldefault(...))` and not a bare `proacl`, because a
    // NULL proacl means "the built-in default", which for a function is owner
    // plus EXECUTE to PUBLIC. `aclexplode(NULL)` returns no rows, so a function
    // that was never granted OR revoked is wide open and, read the naive way,
    // INVISIBLE TO THIS ASSERTION. That is not hypothetical: it is exactly the
    // state a schema-scoped `alter default privileges ... revoke ... from
    // public` produces, which is the no-op that 20260829080000 exists to fix.
    const rows = await db.execute<{ proname: string }>(sql`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform'
         and exists (select 1
                       from aclexplode(coalesce(p.proacl,
                                                acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    `);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("keeps PUBLIC off future functions too", async () => {
    // The assertion above is about the functions that exist. This one is about
    // the rule, and it is the one that would have caught the original bug: an
    // earlier schema-wide revoke was real, so every check of the then-current
    // surface passed, while the statement meant to hold the line did nothing
    // and the next migration to add a function reopened everything.
    //
    // Create one and look, rather than inspecting pg_default_acl. The stored
    // row is a delta merged over acldefault() at creation time, so the row
    // reads clean in both the working and the broken configuration. Only the
    // created object tells the truth.
    await db.execute(
      sql`create function "platform".__public_execute_probe() returns int language sql as $$ select 1 $$`,
    );
    try {
      const [row] = await db.execute<{ public_can_execute: boolean }>(sql`
        select has_function_privilege('public',
                 'platform.__public_execute_probe()', 'execute') as public_can_execute
      `);
      expect(row!.public_can_execute).toBe(false);
    } finally {
      await db.execute(
        sql`drop function if exists "platform".__public_execute_probe()`,
      );
    }
  });

  it("did not take the API roles down with it", async () => {
    // The revoke is only correct because anon/authenticated hold explicit
    // grants. If a future change removes those, this catches it rather than the
    // moderation UI breaking in production.
    const [row] = await db.execute<{ anon: number; authed: number }>(sql`
      select count(*) filter (where has_function_privilege('anon', p.oid, 'execute'))::int          as anon,
             count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute'))::int as authed
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform'
    `);
    expect(row!.anon).toBeGreaterThan(0);
    expect(row!.authed).toBeGreaterThan(0);
  });
});
