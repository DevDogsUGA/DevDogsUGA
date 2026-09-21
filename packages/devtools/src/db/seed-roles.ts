/**
 * `db seed roles` — reconcile platform's role catalogue against a target.
 *
 * Runs 01_roles.sql, the complete built-in and organizational role catalogue,
 * against the chosen target. It never assigns Root: bootstrapping that
 * break-glass role requires the explicit, service-key-backed grant-root command.
 */
import { join } from "node:path";
import { PROJECT_ROOT } from "../environment.js";
import { supabase } from "./run.js";

const SEED_FILES = [join(PROJECT_ROOT, "supabase", "seed", "01_roles.sql")];

/**
 * Always `--db-url` — the session's own connection string, never the
 * supabase CLI's `--local`/`--linked` modes. `db query`, which this runs
 * through, supports it the same way `db reset`/`db push` do. See
 * `db/connection.ts`'s header.
 */
export async function runSeedRoles(dbUrl: string): Promise<number> {
  for (const file of SEED_FILES) {
    const code = await supabase(
      "db",
      "query",
      "--file",
      file,
      "--db-url",
      dbUrl,
    );
    if (code !== 0) return code;
  }
  return 0;
}
