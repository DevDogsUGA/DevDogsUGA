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
 * `--local` for the Docker stack; for a hosted project, `--db-url` against
 * the resolved tier's own connection string rather than `--linked` (the
 * supabase CLI's ambient, tier-unaware project). `db query`, which this runs
 * through, supports `--db-url` the same way `db reset`/`db push` do.
 */
export type RolesConnection =
  { kind: "local" } | { kind: "remote"; dbUrl: string };

export async function runSeedRoles(
  connection: RolesConnection,
): Promise<number> {
  const flags =
    connection.kind === "remote" ? ["--db-url", connection.dbUrl] : ["--local"];
  for (const file of SEED_FILES) {
    const code = await supabase("db", "query", "--file", file, ...flags);
    if (code !== 0) return code;
  }
  return 0;
}
