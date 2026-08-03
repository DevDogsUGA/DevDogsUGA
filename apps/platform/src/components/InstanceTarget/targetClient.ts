import { createClient } from "@supabase/supabase-js";

export interface TargetConfig {
  url: string;
  key: string;
}

/**
 * The targeted client keeps its session under its own storage key so it cannot
 * collide with the session for devdogsuga.org itself. Signing in as a seeded
 * persona on your own stack must not sign you out of the console you are
 * driving it from.
 */
const SESSION_STORAGE_KEY = "devdogs:instanceTarget:auth";

/**
 * Built with `@supabase/supabase-js` directly rather than through
 * `@devdogsuga/sb`, whose factories are typed against *this* project's
 * generated `Database`. The target is a different project, and — for a
 * contributor mid-migration — may not have the same schemas at all.
 */
export function buildTargetClient(config: TargetConfig) {
  return createClient(config.url, config.key, {
    db: { schema: "platform" },
    auth: {
      storageKey: SESSION_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
    },
  });
}

/**
 * Derived from the factory rather than written out, because supabase-js encodes
 * the default schema in the client's type and spelling that out by hand goes
 * stale the moment the options above change.
 */
export type TargetClient = ReturnType<typeof buildTargetClient>;
