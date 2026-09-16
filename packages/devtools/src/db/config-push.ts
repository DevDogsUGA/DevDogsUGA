import { supabase } from "./run.js";

export async function runConfigPush(): Promise<number> {
  return supabase("config", "push");
}
