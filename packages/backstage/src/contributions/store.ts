/**
 * The database half of `import contributions`: what is already recorded, which
 * GitHub accounts are linked, and the insert.
 *
 * The insert matches each author to a member by GitHub user id against
 * `auth.identities.provider_id`, exactly as the webhook does, and
 * `on conflict do nothing` makes a rerun (or a pull request the webhook
 * already recorded) a no-op.
 */
import { withConnection } from "../production/access.js";
import type { MergedPullRequest } from "./github.js";

export interface Existing {
  /** `owner/name#number` of everything already in the table. */
  keys: Set<string>;
  /** GitHub user ids linked to a member. */
  linkedGithubIds: Set<string>;
}

export const keyOf = (repo: string, number: number) => `${repo}#${number}`;

export type ReadExisting = () => Promise<Existing>;

export function readExistingFor(url: string): ReadExisting {
  return () =>
    withConnection(
      url,
      "Could not read the contributions table",
      async (sql) => {
        const [recorded, linked] = await Promise.all([
          sql`select "repo", "prNumber" from "platform"."contributions"`,
          sql`select "provider_id" from "auth"."identities" where "provider" = 'github'`,
        ]);
        return {
          keys: new Set(
            recorded.map((r) => keyOf(String(r.repo), Number(r.prNumber))),
          ),
          linkedGithubIds: new Set(linked.map((r) => String(r.provider_id))),
        };
      },
    );
}

export const APPLY_INSERT = `
insert into "platform"."contributions" (
  "repo", "repoPrivate", "prNumber", "title", "url", "mergedAt",
  "authorGithubId", "authorLogin", "userId"
)
select t.repo, t.private, t.number, t.title, t.url, t.merged, t.gid, t.login,
       (select i."user_id" from "auth"."identities" i
         where i."provider" = 'github' and i."provider_id" = t.gid)
from unnest(
  $1::text[], $2::boolean[], $3::int[], $4::text[], $5::text[],
  $6::timestamptz[], $7::text[], $8::text[]
) as t(repo, private, number, title, url, merged, gid, login)
on conflict do nothing
`;

export type ApplyContributions = (
  writes: readonly MergedPullRequest[],
) => Promise<{ inserted: number }>;

export function applyContributionsFor(url: string): ApplyContributions {
  return (writes) =>
    withConnection(url, "The backfill was rolled back", async (sql) => {
      const result = await sql.unsafe(APPLY_INSERT, [
        writes.map((w) => w.repo),
        writes.map((w) => w.repoPrivate),
        writes.map((w) => w.number),
        writes.map((w) => w.title),
        writes.map((w) => w.url),
        writes.map((w) => w.mergedAt.toISOString()),
        writes.map((w) => w.authorGithubId),
        writes.map((w) => w.authorLogin),
      ] as never);
      return { inserted: result.count };
    });
}
