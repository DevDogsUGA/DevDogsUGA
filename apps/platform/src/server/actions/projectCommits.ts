"use server";
import { authorizeSession } from "~/server/auth/access";
import { requestCommitRefresh } from "~/server/github/refresh";

/**
 * Refreshes the commits of one of a Project's repos. Needs a session; whether
 * this member may do it for this Project is the record rule in
 * `requestCommitRefresh`, which also rate-limits per user and repo.
 */
export async function refreshProjectCommitsAction(
  projectId: string,
  repoId: string,
) {
  const access = await authorizeSession();
  if (!access.ok) return access;
  return requestCommitRefresh(access.caller, projectId, repoId);
}
