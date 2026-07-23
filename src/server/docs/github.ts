import { Octokit } from "@octokit/rest";
import { env } from "~/env";

const octokit = new Octokit({
  auth: env.GITHUB_TOKEN,
});

export interface DocsTreeEntry {
  /** Path below docs/, ".md" kept (e.g. "guides/setup.md"). */
  path: string;
  blobSha: string;
}

/** Resolves a branch's head commit sha; null if the branch doesn't exist. */
export async function getBranchHead(repo: string, branch: string) {
  try {
    const result = await octokit.request(
      "GET /repos/{owner}/{repo}/branches/{branch}",
      { owner: env.GITHUB_ORG, repo, branch },
    );
    return result.data.commit.sha;
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

/**
 * Lists every markdown file under docs/ at the given commit. Fetches the root
 * tree non-recursively first and then only the docs/ subtree recursively, so
 * repository size outside docs/ can never truncate the listing. (The subtree
 * request could itself truncate only past ~100k entries; that degenerate case
 * falls back to a per-directory walk.)
 */
export async function getDocsTree(
  repo: string,
  commitSha: string,
): Promise<DocsTreeEntry[]> {
  const root = await octokit.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    { owner: env.GITHUB_ORG, repo, tree_sha: commitSha },
  );

  const docsEntry = root.data.tree.find(
    (entry) => entry.path === "docs" && entry.type === "tree",
  );
  if (!docsEntry?.sha) return [];

  const docs = await octokit.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    { owner: env.GITHUB_ORG, repo, tree_sha: docsEntry.sha, recursive: "1" },
  );

  if (docs.data.truncated) {
    console.warn(
      `[docs-sync] ${repo}: docs/ tree truncated by GitHub; falling back to per-directory walk`,
    );
    return walkTree(repo, docsEntry.sha, "");
  }

  return docs.data.tree.flatMap((entry) =>
    entry.type === "blob" &&
    typeof entry.path === "string" &&
    typeof entry.sha === "string" &&
    entry.path.endsWith(".md")
      ? [{ path: entry.path, blobSha: entry.sha }]
      : [],
  );
}

/** Last-resort listing for absurdly large docs trees: one request per directory. */
async function walkTree(
  repo: string,
  treeSha: string,
  prefix: string,
): Promise<DocsTreeEntry[]> {
  const result = await octokit.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    { owner: env.GITHUB_ORG, repo, tree_sha: treeSha },
  );

  const entries: DocsTreeEntry[] = [];
  for (const entry of result.data.tree) {
    if (!entry.path || !entry.sha) continue;
    const path = prefix ? `${prefix}/${entry.path}` : entry.path;
    if (entry.type === "blob" && entry.path.endsWith(".md")) {
      entries.push({ path, blobSha: entry.sha });
    } else if (entry.type === "tree") {
      entries.push(...(await walkTree(repo, entry.sha, path)));
    }
  }
  return entries;
}

/** Fetches a blob's raw text content by sha. */
export async function getBlob(repo: string, blobSha: string): Promise<string> {
  const result = await octokit.request(
    "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
    { owner: env.GITHUB_ORG, repo, file_sha: blobSha },
  );
  return Buffer.from(result.data.content, "base64").toString("utf-8");
}
