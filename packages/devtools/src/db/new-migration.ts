import { supabase } from "./run.js";

export async function runNewMigration(
  name: string | undefined,
): Promise<number> {
  if (!name) {
    process.stderr.write(
      "devtools new-migration: a migration name is required.\n",
    );
    return 1;
  }
  return supabase("migration", "new", name);
}
