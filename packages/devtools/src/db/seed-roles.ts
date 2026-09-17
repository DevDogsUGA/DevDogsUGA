/**
 * `db seed-roles` — seed platform's built-in roles against a database target.
 *
 * Runs 01_roles.sql (Member + Root definitions) and then 02_root_bootstrap.sql
 * (idempotent Root grant onto the earliest non-test user) against the chosen
 * target. Both files are idempotent: definitions use ON CONFLICT DO NOTHING and
 * the bootstrap is a no-op when Root is already held.
 */
import { join } from "node:path";
import { PROJECT_ROOT } from "../environment.js";
import { supabase } from "./run.js";

const SEED_FILES = [
  join(PROJECT_ROOT, "supabase", "seed", "01_roles.sql"),
  join(PROJECT_ROOT, "supabase", "seed", "02_root_bootstrap.sql"),
];

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
