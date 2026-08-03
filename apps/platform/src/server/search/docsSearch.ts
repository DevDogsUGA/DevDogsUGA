import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { docsHref, splitProjectPath } from "~/lib/docsSlug";
import { toTitleCase } from "~/lib/toTitleCase";
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
  /** The stored path relative to docs/, project prefix included. */
  path: string;
  snippet: string;
}

function toSnippetHtml(raw: string): string {
  return escapeHtml(raw)
    .replaceAll(START, "<mark>")
    .replaceAll(STOP, "</mark>");
}

/**
 * Full-text search over the docs index using Postgres websearch syntax (quoted
 * phrases, OR, -exclusions). The table is populated at deploy time by
 * `pnpm docs:index` from the same build-time artifact the pages render from —
 * see scripts/index-docs.ts. ts_headline runs on the top N rows only; it's by
 * far the most expensive part.
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
        ts_rank(p."search", websearch_to_tsquery('english', ${query})) as "rank"
      -- Schema-qualified: this is the only raw db.execute() in the app, so it
      -- doesn't get the qualification drizzle's query builder applies, and the
      -- connection's search_path does not include "platform".
      from platform."docsPages" p
      where p."search" @@ websearch_to_tsquery('english', ${query})
      order by "rank" desc
      limit ${limit}
    )
    select
      "title",
      "description",
      "path",
      ts_headline(
        'english',
        "plainText",
        websearch_to_tsquery('english', ${query}),
        ${HEADLINE_OPTIONS}
      ) as "snippet"
    from "hits"
    order by "rank" desc
  `);

  return (rows as unknown as DocsHit[]).map((hit) => {
    const { project, path } = splitProjectPath(hit.path);
    const relSegments = path ? path.split("/") : [];
    return {
      id: `docs:${hit.path}`,
      title: hit.title,
      description: hit.description ?? undefined,
      url: docsHref(project, relSegments),
      icon: "BookOpenIcon" as const,
      breadcrumbs: [
        "Docs",
        toTitleCase(project),
        ...relSegments.slice(0, -1).map(toTitleCase),
      ],
      group: "docs" as const,
      snippet: toSnippetHtml(hit.snippet),
    };
  });
}
