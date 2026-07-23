/**
 * The Postgres schema this app owns. Every Supabase client below defaults its
 * `.from()` calls to this schema. Changing this one constant re-points the
 * whole app (the Phase 3 `public` → `platform` migration flips it here).
 */
export const APP_SCHEMA = "platform" as const;
