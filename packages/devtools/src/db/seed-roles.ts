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

export async function runSeedRoles(
  target: "local" | "remote",
): Promise<number> {
  const flag = target === "remote" ? "--linked" : "--local";
  for (const file of SEED_FILES) {
    const code = await supabase("db", "query", "--file", file, flag);
    if (code !== 0) return code;
  }
  return 0;
}
