/**
 * The control check (Q41) for a member linking a repo, run before any link
 * row is written. D3's link action calls this and stores the `approval` and
 * `basis` it returns.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { newBudget } from "./client";
import { checkControl, resolveRepo } from "./repos";
import { githubClient } from "./sync";

/** Resolves a typed `owner/name` and proves control with the member's linked GitHub id; no submitted login is trusted. */
export async function resolveControlledRepo(userId: string, name: string) {
  const [identity] = await db.execute<{ id: string; login: string }>(
    sql`select provider_id as id, coalesce(identity_data->>'user_name','') as login from auth.identities where provider='github' and user_id=${userId}::uuid limit 1`,
  );
  if (!identity)
    return { ok: false as const, message: "Link your GitHub account first." };
  const api = githubClient(),
    budget = newBudget();
  const repo = await resolveRepo(api, budget, name);
  if (!repo.ok) return repo;
  const control = await checkControl(api, budget, repo.data, identity);
  return control.ok
    ? { ok: true as const, data: { repo: repo.data, ...control.data } }
    : control;
}
