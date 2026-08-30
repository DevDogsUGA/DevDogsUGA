/**
 * The three questions that decide whether a connection IS the planner:
 *
 *   1. Who did Postgres authenticate? (`current_user`)
 *   2. Can it read an application schema? (it must not)
 *   3. Can it read the migrations table? (it must, the dry run is next)
 *
 * Shared between `deploy require-planner` (which turns a bad answer into a
 * red CI job) and `planner create` / `planner reset-password` (which run the
 * same checks over a fresh connection before calling the credential done),
 * so "validated working" means the same thing in both places.
 *
 * ⚠️ Check 2 exists because nothing else can catch the mistake it looks for.
 * The preflight `DB_URL` is a value somebody composes by hand, the registry
 * cannot verify it, and a full-access connection string pasted there works
 * identically: the dry run succeeds, `env push` uploads it, `env audit` sees
 * no drift. Reading a `platform.*` table and EXPECTING the permission error
 * is the only observable difference between the right credential and the
 * wrong one.
 */
import { PLANNER_ROLE } from "./role.js";
import type { PlannerDb } from "./db.js";

/** Constants, so `PlannerDb.run` never sees a composed string. */
export const CHECK_IDENTITY = "select current_user as who";
/**
 * `platform.profile` because it exists in every tier and holds real member
 * data in production: the exact rows §3.5 refuses to put behind `main`.
 */
export const CHECK_OVERREACH = "select * from platform.profile limit 1";
export const CHECK_MIGRATIONS =
  "select count(*)::int as n from supabase_migrations.schema_migrations";

export interface PlannerVerdict {
  ok: boolean;
  /** One line per check, in the order run; the report either way. */
  lines: string[];
  /** Set when `ok` is false: what to go and fix. */
  problem?: string;
}

/**
 * Runs the three checks over an OPEN connection; never closes it.
 *
 * Any error from check 2 counts as "cannot read": the interesting distinction
 * is readable versus not, and a role that cannot even enumerate the schema
 * (the validated state) throws just as loudly as one denied on the table.
 */
export async function checkPlanner(db: PlannerDb): Promise<PlannerVerdict> {
  const lines: string[] = [];

  const [identity] = await db.run(CHECK_IDENTITY);
  const who = String(identity?.who ?? "");
  if (who !== PLANNER_ROLE) {
    return {
      ok: false,
      lines,
      problem:
        `the connection authenticated as "${who}", not ${PLANNER_ROLE} — ` +
        "this is a full-privilege connection string where the planner role " +
        "belongs.",
    };
  }
  lines.push(`authenticated as ${PLANNER_ROLE}`);

  let overreach = false;
  try {
    await db.run(CHECK_OVERREACH);
    overreach = true;
  } catch {
    lines.push("cannot read platform.* (permission denied, as it must be)");
  }
  if (overreach) {
    return {
      ok: false,
      lines,
      problem:
        `${PLANNER_ROLE} can read platform.profile. The role has grants ` +
        "beyond the validated pair — drop and re-create it, then re-push " +
        "the preflight target.",
    };
  }

  try {
    const [row] = await db.run(CHECK_MIGRATIONS);
    lines.push(
      `can read supabase_migrations.schema_migrations (${String(row?.n)} rows)`,
    );
  } catch (error) {
    // Two causes share this symptom, and the fix for one is a GRANT while
    // the fix for the other is initializing the database's migration
    // history, so the message has to say which. 3F000 is
    // invalid_schema_name; the text match covers drivers that drop the code.
    if (isMissingSchema(error)) {
      return {
        ok: false,
        lines,
        problem:
          "the supabase_migrations schema does not exist on this database. " +
          "The Supabase CLI creates it the first time it records migration " +
          "history there (`supabase db push`, or `supabase migration " +
          "repair` when baselining an existing database) — until then " +
          "there is nothing for the planner to read and nothing for the " +
          "dry run to plan against. This is not a grants problem.",
      };
    }
    return {
      ok: false,
      lines,
      problem:
        `${PLANNER_ROLE} cannot read supabase_migrations.schema_migrations, ` +
        "so the migration dry run would fail right after this. Re-apply the " +
        "two grants (see planner/role.ts).",
    };
  }

  return { ok: true, lines };
}

/** Postgres 3F000 (invalid_schema_name), with a text fallback. */
export function isMissingSchema(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    e.code === "3F000" ||
    /schema "?supabase_migrations"? does not exist/i.test(e.message ?? "")
  );
}
