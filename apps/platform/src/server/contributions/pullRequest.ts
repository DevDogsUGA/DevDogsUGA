import { z } from "zod";

/** One merged pull request, as `platform.contributions` keeps it. */
export interface MergedPullRequest {
  /** `owner/name`, as GitHub spells it. */
  repo: string;
  repoPrivate: boolean;
  number: number;
  title: string;
  url: string;
  mergedAt: Date;
  /** The author's numeric GitHub user id, as text (matches `provider_id`). */
  authorGithubId: string;
  authorLogin: string;
}

const repository = z.object({
  full_name: z.string().min(1),
  private: z.boolean().optional(),
  owner: z.object({ login: z.string().min(1) }),
});

const user = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  login: z.string().min(1),
  type: z.string().optional(),
});

const pullRequest = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  html_url: z.string().url(),
  merged: z.boolean().optional(),
  merged_at: z.string().nullable().optional(),
  user: user.nullable(),
});

const event = z.object({
  action: z.string(),
  pull_request: pullRequest,
  repository,
});

/** Only pull requests that live on github.com are linked to from a profile. */
const GITHUB_PREFIX = "https://github.com/";

/** The result of reading a `pull_request` delivery. */
export type ParsedEvent =
  | { kind: "merged"; pullRequest: MergedPullRequest }
  | { kind: "ignored"; reason: string };

/**
 * Reads a `pull_request` webhook payload. Only `closed` with `merged: true`
 * from a human author in a repository of `org` counts; everything else is
 * `ignored` with the reason, which the route answers with a 2xx so GitHub does
 * not retry it.
 */
export function parsePullRequestEvent(
  payload: unknown,
  org: string,
): ParsedEvent {
  const parsed = event.safeParse(payload);
  if (!parsed.success)
    return { kind: "ignored", reason: "unrecognised payload" };
  const { action, pull_request: pr, repository: repo } = parsed.data;
  if (action !== "closed")
    return { kind: "ignored", reason: `action ${action}` };
  if (pr.merged !== true || !pr.merged_at) {
    return { kind: "ignored", reason: "not merged" };
  }
  if (repo.owner.login.toLowerCase() !== org.toLowerCase()) {
    return { kind: "ignored", reason: "outside the organization" };
  }
  if (!pr.user || pr.user.type === "Bot") {
    return { kind: "ignored", reason: "no human author" };
  }
  const mergedAt = new Date(pr.merged_at);
  if (
    Number.isNaN(mergedAt.getTime()) ||
    !pr.html_url.startsWith(GITHUB_PREFIX)
  ) {
    return { kind: "ignored", reason: "unrecognised payload" };
  }
  return {
    kind: "merged",
    pullRequest: {
      repo: repo.full_name,
      repoPrivate: repo.private === true,
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      mergedAt,
      authorGithubId: String(pr.user.id),
      authorLogin: pr.user.login,
    },
  };
}
