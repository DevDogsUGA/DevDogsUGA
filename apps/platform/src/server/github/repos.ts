/**
 * Repo-level GitHub operations. Each returns a typed result and never throws
 * for an expected failure, and each goes through the one authenticated
 * transport, so only public repos are ever read (D0 section 8.7).
 */
import "server-only";
import type { Budget, GithubClient, GithubResult } from "./client";

export type Repo = {
  id: number;
  private: boolean;
  name: string;
  owner: { id: number; login: string; type: "User" | "Organization" };
  default_branch: string | null;
};
export const repoPath = (r: Repo) =>
  `/repos/${encodeURIComponent(r.owner.login)}/${encodeURIComponent(r.name)}`;
/** The DevDogsUGA organization's numeric GitHub id (D0 section 8.2), not its login. */
const DEVDOGS_ORG_ID = 168223232;
export const isDevdogs = (r: Repo) =>
  r.owner.id === DEVDOGS_ORG_ID && r.owner.type === "Organization";

/** Resolves a typed name; private repositories never become eligible links. */
export async function resolveRepo(
  client: GithubClient,
  budget: Budget,
  name: string,
): Promise<GithubResult<Repo>> {
  if (!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(name) || /\/\.{1,2}$/.test(name))
    return {
      ok: false,
      kind: "unavailable",
      message: "Enter owner/name",
      retryAt: new Date(),
    };
  const result = await client.githubFetch<Repo>(`/repos/${name}`, budget);
  return publicRepo(result);
}
export function publicRepo(result: GithubResult<Repo>): GithubResult<Repo> {
  return result.ok && result.data.private
    ? {
        ok: false,
        kind: "unavailable",
        message: "Only public repositories count",
        retryAt: new Date(),
      }
    : result;
}

/**
 * Whether the member controls the repo (Q41), from the numeric provider
 * identity the server loaded, never a login a form supplied.
 *
 * - A personal repo: the owner is a User whose id is the member's linked
 *   GitHub id. An owner login that changed since is irrelevant.
 * - A DevDogsUGA repo: the member has write or admin on it, by the installation
 *   token's collaborator-permission check, using their current login looked up
 *   by id.
 * - Any other organization's repo: no proof is possible, so the link is
 *   `pending` until an officer approves it.
 */
export async function checkControl(
  client: GithubClient,
  budget: Budget,
  repo: Repo,
  identity: { id: string; login: string },
): Promise<
  GithubResult<{
    approval: "approved" | "pending";
    basis: "personal" | "devdogs-write" | "officer";
  }>
> {
  const denied = (): GithubResult<never> => ({
    ok: false,
    kind: "unavailable",
    message: "Repository control could not be proved",
    retryAt: new Date(),
  });
  if (repo.private) return denied();
  if (repo.owner.type === "User")
    return String(repo.owner.id) === identity.id
      ? {
          ok: true,
          data: { approval: "approved", basis: "personal" },
          next: false,
        }
      : denied();
  if (!isDevdogs(repo))
    return {
      ok: true,
      data: { approval: "pending", basis: "officer" },
      next: false,
    };
  // Refresh login by immutable id before using it in the permission endpoint.
  const user = await client.githubFetch<{ id: number; login: string }>(
    `/user/${identity.id}`,
    budget,
  );
  if (!user.ok) return user;
  if (String(user.data.id) !== identity.id) return denied();
  const permission = await client.githubFetch<{ permission: string }>(
    `${repoPath(repo)}/collaborators/${encodeURIComponent(user.data.login)}/permission`,
    budget,
  );
  if (!permission.ok) return permission;
  return ["write", "admin"].includes(permission.data.permission)
    ? {
        ok: true,
        data: { approval: "approved", basis: "devdogs-write" },
        next: false,
      }
    : denied();
}

/**
 * One page of the org's public repos, for the sweep's inventory phase, which
 * persists the next page between invocations. Private repos are filtered out
 * as well as excluded by the query: they are never synced.
 */
export async function inventoryPage(
  client: GithubClient,
  budget: Budget,
  page: number,
) {
  const result = await client.githubFetch<Repo[]>(
    `/orgs/DevDogsUGA/repos?type=public&per_page=100&page=${page}`,
    budget,
  );
  return result.ok
    ? { ...result, data: result.data.filter((r) => !r.private && isDevdogs(r)) }
    : result;
}
