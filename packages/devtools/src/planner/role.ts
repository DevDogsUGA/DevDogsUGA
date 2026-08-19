/**
 * The `migration_planner` role: the one Postgres credential `main` may hold.
 *
 * §3.5's stage-1 dry run answers "what would these migrations do to
 * production" from `main`, so whatever it authenticates with is reachable
 * from the `main` trust tier. The plan refuses even a general read-only role
 * there — it would put every row of production data behind that boundary —
 * which leaves a role that can read the migrations-history table and nothing
 * else. These two grants are the whole of it:
 *
 *   grant usage  on schema supabase_migrations            to migration_planner;
 *   grant select on supabase_migrations.schema_migrations to migration_planner;
 *
 * This module is the pure half: names, SQL text, password generation, URL
 * derivation. Everything that talks to a database lives beside it.
 */
import { randomBytes } from "node:crypto";

export const PLANNER_ROLE = "migration_planner";

/**
 * The statements `planner create` runs, in order. Exported so the test can
 * assert the grants byte-for-byte against the security plan's validated pair
 * — a paraphrase here would be a second copy that can drift.
 *
 * The password is interpolated rather than bound because CREATE ROLE is a
 * utility statement — Postgres does not accept bind parameters in one — and
 * that is safe here ONLY because `generatePassword()` emits the base64url
 * alphabet: no quote, no backslash, nothing needing escape. Do not widen the
 * alphabet without revisiting this.
 */
export function createRoleSql(password: string): string[] {
  return [
    `create role ${PLANNER_ROLE} login password '${password}'`,
    `grant usage on schema supabase_migrations to ${PLANNER_ROLE}`,
    `grant select on supabase_migrations.schema_migrations to ${PLANNER_ROLE}`,
  ];
}

/** ALTER ROLE, same interpolation contract as `createRoleSql`. */
export function resetPasswordSql(password: string): string {
  return `alter role ${PLANNER_ROLE} password '${password}'`;
}

/**
 * 192 bits, base64url. The alphabet is load-bearing twice over: it needs no
 * escaping inside the SQL literal above, and no percent-encoding inside the
 * userinfo of the connection URL the password ends up in.
 */
export function generatePassword(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The preflight `DB_URL`, derived from the admin one.
 *
 * Everything but the identity is kept — host, port, database — because the
 * planner connects to the same place as everyone else. Only the userinfo
 * changes, and the username's shape depends on the route in a way worth
 * spelling out: through Supabase's session pooler the username is
 * `<role>.<project-ref>`, so the ref (everything after the first dot of the
 * admin username) survives the swap; on a direct connection the username is
 * the bare role.
 */
export function plannerUrlFrom(adminUrl: string, password: string): string {
  const url = new URL(adminUrl);
  const ref = url.username.includes(".")
    ? url.username.slice(url.username.indexOf("."))
    : "";
  url.username = `${PLANNER_ROLE}${ref}`;
  url.password = password;
  return url.toString();
}
