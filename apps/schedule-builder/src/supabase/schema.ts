/**
 * The Postgres schema this app owns. Every Supabase client below defaults its
 * `.from()` calls to this schema.
 */
export const APP_SCHEMA = "schedule_builder" as const;
