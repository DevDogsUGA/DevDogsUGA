import type { DatabaseSchema } from "@devdogsuga/db/client";
import type { Database } from "./database.types.js";

/**
 * Canonical map of app → Postgres schema. Each app in the monorepo owns one
 * schema; the values here are the exact schema names created by the SQL
 * migrations in `supabase/migrations` and exposed via `[api] schemas` in
 * `supabase/config.toml`.
 *
 * Schema isolation is organizational, not a security boundary. Every schema
 * is reachable through the one PostgREST endpoint. Row-Level Security is what
 * actually protects data. See the monorepo plan's "Security model" section.
 *
 * `satisfies Record<string, DatabaseSchema<Database>>` keys each value
 * against the generated `Database` type: a schema name here that the
 * generated types don't expose (a typo, or a schema dropped from
 * `[api] schemas` in `supabase/config.toml`) fails to compile instead of
 * surfacing as a PostgREST 404 the first time an app calls `.schema()` with
 * it.
 */
export const SCHEMAS = {
  platform: "platform",
  scheduleBuilder: "schedule_builder",
  studyGroupFinder: "study_group_finder",
} as const satisfies Record<string, DatabaseSchema<Database>>;

export type AppKey = keyof typeof SCHEMAS;
export type SchemaName = (typeof SCHEMAS)[AppKey];
