/**
 * Reading merged pull requests through the read-only GitHub App
 * (devdogs-platform; Metadata and Pull requests read).
 *
 * The App signs a short-lived JWT with its private key, exchanges it for an
 * installation token on the organization, and the token lists the repositories
 * it can see and each one's closed pull requests. `fetch` is injected so the
 * tests never touch the network.
 */
import { createSign } from "node:crypto";

export const ORGANIZATION = "DevDogsUGA";

/** One merged pull request, as `platform.contributions` keeps it. */
export interface MergedPullRequest {
  repo: string;
  repoPrivate: boolean;
  number: number;
  title: string;
  url: string;
  mergedAt: Date;
  /** The author's numeric GitHub user id, as text. */
  authorGithubId: string;
  authorLogin: string;
}

export class GithubError extends Error {
  override name = "GithubError";
}

type Fetch = typeof fetch;

const API = "https://api.github.com";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** An App JWT, valid for ten minutes (GitHub's maximum), RS256. */
export function appJwt(
  appId: string,
  privateKey: string,
  now = Date.now(),
): string {
  const pem = privateKey.includes("\\n")
    ? privateKey.replace(/\\n/g, "\n")
    : privateKey;
  const seconds = Math.floor(now / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iat: seconds - 60, exp: seconds + 9 * 60, iss: appId }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(pem);
  return `${unsigned}.${base64url(signature)}`;
}

async function call<T>(
  doFetch: Fetch,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await doFetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "devdogs-backstage",
    },
  });
  if (!response.ok) {
    throw new GithubError(
      `GitHub answered ${response.status} for ${init.method ?? "GET"} ${path.split("?")[0]}.`,
    );
  }
  return (await response.json()) as T;
}

async function pages<T>(
  load: (page: number) => Promise<T[]>,
  /** True when nothing on later pages can matter, so paging stops. */
  done: (batch: T[]) => boolean = () => false,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const batch = await load(page);
    all.push(...batch);
    if (batch.length < 100 || done(batch)) return all;
  }
}

interface ApiPull {
  number: number;
  title: string;
  html_url: string;
  merged_at: string | null;
  updated_at: string;
  user: { id: number; login: string; type?: string } | null;
}

export interface FetchOptions {
  appId: string;
  privateKey: string;
  /** Only this `owner/name`. */
  repo?: string | undefined;
  /** Only pull requests merged at or after this instant. */
  since?: Date | undefined;
  fetch?: Fetch;
  now?: () => number;
  onRepo?: (repo: string, merged: number) => void;
}

/** Every merged, human-authored pull request the installation can see. */
export async function fetchMergedPullRequests(
  options: FetchOptions,
): Promise<MergedPullRequest[]> {
  const doFetch = options.fetch ?? fetch;
  const jwt = appJwt(
    options.appId,
    options.privateKey,
    options.now?.() ?? Date.now(),
  );
  const installation = await call<{ id: number }>(
    doFetch,
    jwt,
    `/orgs/${ORGANIZATION}/installation`,
  );
  const { token } = await call<{ token: string }>(
    doFetch,
    jwt,
    `/app/installations/${installation.id}/access_tokens`,
    { method: "POST" },
  );

  const repositories = (
    await pages(
      async (page) =>
        (
          await call<{
            repositories: { full_name: string; private: boolean }[];
          }>(
            doFetch,
            token,
            `/installation/repositories?per_page=100&page=${page}`,
          )
        ).repositories,
    )
  ).filter(
    (r) =>
      !options.repo || r.full_name.toLowerCase() === options.repo.toLowerCase(),
  );
  if (options.repo && repositories.length === 0) {
    throw new GithubError(
      `The App cannot see ${options.repo}. Check the repository name and the installation.`,
    );
  }

  const out: MergedPullRequest[] = [];
  for (const repository of repositories) {
    // Newest-updated first, and a PR is never merged after its last update,
    // so once a page ends before `since` nothing later can qualify.
    const pulls = await pages(
      async (page) =>
        call<ApiPull[]>(
          doFetch,
          token,
          `/repos/${repository.full_name}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
        ),
      (batch) => {
        const last = batch[batch.length - 1];
        return (
          !!options.since && !!last && new Date(last.updated_at) < options.since
        );
      },
    );
    let merged = 0;
    for (const pull of pulls) {
      if (!pull.merged_at || !pull.user || pull.user.type === "Bot") continue;
      const mergedAt = new Date(pull.merged_at);
      if (options.since && mergedAt < options.since) continue;
      merged += 1;
      out.push({
        repo: repository.full_name,
        repoPrivate: repository.private,
        number: pull.number,
        title: pull.title,
        url: pull.html_url,
        mergedAt,
        authorGithubId: String(pull.user.id),
        authorLogin: pull.user.login,
      });
    }
    options.onRepo?.(repository.full_name, merged);
  }
  return out;
}
