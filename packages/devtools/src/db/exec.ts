/**
 * `db exec -- <args…>` — the escape hatch.
 *
 * Everything after `--` passes straight to the Supabase CLI, unmodified. Same
 * stance as `bw` and `cf exec`: the wrapped CLI owns its own targeting and its
 * own flags, so this declares no subcommands and does no parsing of its own.
 */
import { supabase } from "./run.js";

export async function runDbExec(args: string[]): Promise<number> {
  return supabase(...args);
}
