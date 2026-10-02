import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { docsHref, splitProjectPath } from "~/lib/docsSlug";
import { toTitleCase } from "~/lib/toTitleCase";
import { escapeHtml } from "./match";
import { tsQuery, tsScore, type TsMatch } from "./tsquery";
import type { SearchEntry } from "./types";

// Control-character sentinels can't appear in stored plain text, so they
// survive HTML-escaping and are swapped for <mark> tags afterwards. The
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
 * `pnpm -F @devdogsuga/docs populate:search` from the same build-time artifact the pages render from.
 * See `docs-kit index`. ts_headline runs on the top N rows only; it's by
 * far the most expensive part. `match` "any" swaps the syntax for any-word
 * matching (see `tsQuery`).
 */
export async function searchDocs(
  query: string,
  options: {
    limit: number;
    match?: TsMatch;
    /** A project whose pages win ties, so its copy of a shared page leads. */
    preferProject?: string | null;
  },
): Promise<SearchEntry[]> {
  const match = options.match ?? "all";
  const tsq = tsQuery(query, match);
  const preferred = options.preferProject
    ? sql`(split_part(p."path", '/', 1) = ${options.preferProject})`
    : sql`false`;
  const rows = await db.execute(sql`
    with "matches" as (
      select
        p."title",
        p."description",
        p."path",
        p."plainText",
        ${tsScore(sql`p."search"`, query, match)} as "rank",
        ${preferred} as "preferred"
      -- Schema-qualified: this is the only raw db.execute() in the app, so it
      -- doesn't get the qualification drizzle's query builder applies, and the
      -- connection's search_path does not include "platform".
      from platform."docsPages" p
      where p."search" @@ ${tsq}
        -- A page scheduled for later is not found until its time, to the
        -- second: now() is read per query, not per deploy. See
        -- "publishAt" on the table, and docs-kit index.
        and (p."publishAt" is null or p."publishAt" <= now())
    ),
    "hits" as (
      select * from "matches"
      order by floor("rank") desc, "preferred" desc, "rank" desc
      limit ${options.limit}
    )
    select
      "title",
      "description",
      "path",
      ts_headline(
        'english',
        "plainText",
        ${tsq},
        ${HEADLINE_OPTIONS}
      ) as "snippet"
    from "hits"
    order by floor("rank") desc, "preferred" desc, "rank" desc
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
