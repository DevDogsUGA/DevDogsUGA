import { and, desc, eq, exists, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import { commits, githubRepos, repoCommits } from "~/server/db/schema";

/**
 * Reads of `platform.commits`: the commits one member authored on the default
 * branch of a repository the platform syncs.
 *
 * The tables are server-only and these are the readers. The public profile
 * reaches `getCommitsForUser` only after resolving the member through the
 * `publicProfiles` view and checking `showContributions` (see
 * `getPublicProfileActivity`); the member's own pages pass their session id.
 *
 * A commit is stored only for a linked member and only once its default-branch
 * provenance (`repoCommits`) exists, so every read here requires that row.
 */

export interface CommitItem {
  /** `owner/name` of the repository the commit is listed under. */
  repo: string;
  sha: string;
  /** The first line of the commit message. */
  title: string;
  url: string;
  committedAt: Date;
}

/** Newest first, capped so a prolific member cannot make a page unbounded. */
const LIST_LIMIT = 100;

/** The first non-empty line of a commit message, the way GitHub titles it. */
function commitTitle(message: string): string {
  return message.split("\n", 1)[0]?.trim() ?? "";
}

/**
 * A member's commits, newest first, each listed under one repository that has
 * it on its default branch. `publicOnly` leaves out every commit that has no
 * available repository: a repository that turned private or went away is
 * unavailable, and a public profile must never name it. The commits themselves
 * stay valid (and the member's own view, which passes false, still lists them).
 */
export async function getCommitsForUser(
  userId: string,
  options: { publicOnly: boolean },
): Promise<CommitItem[]> {
  const listable = options.publicOnly
    ? and(eq(repoCommits.sha, commits.sha), eq(githubRepos.health, "available"))
    : eq(repoCommits.sha, commits.sha);

  const rows = await db
    .select({
      sha: commits.sha,
      message: commits.message,
      committedAt: commits.committedAt,
    })
    .from(commits)
    .where(
      and(
        eq(commits.userId, userId),
        exists(
          db
            .select({ sha: repoCommits.sha })
            .from(repoCommits)
            .innerJoin(
              githubRepos,
              eq(githubRepos.githubRepoId, repoCommits.githubRepoId),
            )
            .where(listable),
        ),
      ),
    )
    .orderBy(desc(commits.committedAt), desc(commits.sha))
    .limit(LIST_LIMIT);
  if (rows.length === 0) return [];

  const homes = await db
    .select({
      sha: repoCommits.sha,
      owner: githubRepos.owner,
      name: githubRepos.name,
      health: githubRepos.health,
      githubRepoId: githubRepos.githubRepoId,
    })
    .from(repoCommits)
    .innerJoin(
      githubRepos,
      eq(githubRepos.githubRepoId, repoCommits.githubRepoId),
    )
    .where(
      and(
        inArray(
          repoCommits.sha,
          rows.map((row) => row.sha),
        ),
        options.publicOnly ? eq(githubRepos.health, "available") : undefined,
      ),
    );

  // One home per commit: an available repository before an unavailable one,
  // then the lowest repository id, so the choice never flips between loads.
  const homeOf = new Map<string, (typeof homes)[number]>();
  for (const home of homes) {
    const held = homeOf.get(home.sha);
    const better =
      !held ||
      (home.health === "available" && held.health !== "available") ||
      (home.health === held.health && home.githubRepoId < held.githubRepoId);
    if (better) homeOf.set(home.sha, home);
  }

  return rows.flatMap((row) => {
    const home = homeOf.get(row.sha);
    if (!home) return [];
    const repo = `${home.owner}/${home.name}`;
    return [
      {
        repo,
        sha: row.sha,
        title: commitTitle(row.message),
        url: `https://github.com/${encodeURIComponent(home.owner)}/${encodeURIComponent(home.name)}/commit/${row.sha}`,
        committedAt: row.committedAt,
      },
    ];
  });
}
