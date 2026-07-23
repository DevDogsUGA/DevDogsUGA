import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { toTitleCase } from "~/server/docs/parse";
import { docsHref } from "~/lib/docsSlug";
import { escapeHtml } from "./match";
import type { SearchEntry } from "./types";

// Control-character sentinels can't appear in stored plain text, so they
// survive HTML-escaping and are swapped for <mark> tags afterwards — the
// snippet can never smuggle markup from document content.
const START = "\u0002";
const STOP = "\u0003";
const HEADLINE_OPTIONS = `StartSel=${START}, StopSel=${STOP}, MaxWords=18, MinWords=6, MaxFragments=2, FragmentDelimiter= … `;

interface DocsHit {
  title: string;
  description: string | null;
  path: string;
  repo: string;
  repoName: string;
  defaultBranch: string;
  snippet: string;
}

function toSnippetHtml(raw: string): string {
  return escapeHtml(raw)
    .replaceAll(START, "<mark>")
    .replaceAll(STOP, "</mark>");
}

/**
 * Full-text search over ingested docs pages using Postgres websearch syntax
 * (quoted phrases, OR, -exclusions). Only default branches are searched so
 * preview branches never duplicate results. ts_headline runs on the top N
 * rows only — it's by far the most expensive part.
 */
export async function searchDocs(
  query: string,
  limit = 10,
): Promise<SearchEntry[]> {
  const rows = await db.execute(sql`
    with "hits" as (
      select
        p."title",
        p."description",
        p."path",
        p."plainText",
        r."slug" as "repo",
        r."name" as "repoName",
        r."defaultBranch",
        ts_rank(p."search", websearch_to_tsquery('english', ${query})) as "rank"
      from "docsPages" p
      join "docsBranches" b on b."id" = p."branchId"
      join "docsRepos" r on r."id" = b."repoId"
      where
        p."search" @@ websearch_to_tsquery('english', ${query})
        and b."name" = r."defaultBranch"
      order by "rank" desc
      limit ${limit}
    )
    select
      "title",
      "description",
      "path",
      "repo",
      "repoName",
      "defaultBranch",
      ts_headline(
        'english',
        "plainText",
        websearch_to_tsquery('english', ${query}),
        ${HEADLINE_OPTIONS}
      ) as "snippet"
    from "hits"
    order by "rank" desc
  `);

  return (rows as unknown as DocsHit[]).map((hit) => ({
    id: `docs:${hit.repo}:${hit.path}`,
    title: hit.title,
    description: hit.description ?? undefined,
    url: docsHref(
      hit.repo,
      hit.defaultBranch,
      hit.path.split("/"),
      hit.defaultBranch,
    ),
    icon: "BookOpenIcon",
    breadcrumbs: [
      "Docs",
      hit.repoName,
      ...hit.path.split("/").slice(0, -1).map(toTitleCase),
    ],
    group: "docs",
    snippet: toSnippetHtml(hit.snippet),
  }));
}
