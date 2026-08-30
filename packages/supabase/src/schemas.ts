/**
 * Canonical map of app → Postgres schema. Each app in the monorepo owns one
 * schema; the values here are the exact schema names created by the SQL
 * migrations in `supabase/migrations` and exposed via `[api] schemas` in
 * `supabase/config.toml`.
 *
 * Schema isolation is organizational, not a security boundary. Every schema
 * is reachable through the one PostgREST endpoint. Row-Level Security is what
 * actually protects data. See the monorepo plan's "Security model" section.
 */
export const SCHEMAS = {
  platform: "platform",
  scheduleBuilder: "schedule_builder",
  studyGroupFinder: "study_group_finder",
} as const;

export type AppKey = keyof typeof SCHEMAS;
export type SchemaName = (typeof SCHEMAS)[AppKey];
