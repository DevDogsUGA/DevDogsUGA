import { supabase } from "./run.js";

/**
 * `config.toml` lives on a hosted project only — there is no local
 * `--project-ref` to push to — so this takes the ref directly rather than a
 * `Target`. The caller (`cli.ts`) resolves it from the tier, exactly like
 * every other remote db operation now does, instead of letting the supabase
 * CLI fall back to whatever project it has `--linked`.
 */
export async function runConfigPush(projectRef: string): Promise<number> {
  return supabase("config", "push", "--project-ref", projectRef);
}
