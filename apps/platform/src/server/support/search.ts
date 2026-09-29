import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { escapeHtml } from "~/server/search/match";
import type { SearchEntry } from "~/server/search/types";

// Same sentinel trick as docsSearch.ts: control characters survive
// HTML-escaping and become <mark> afterwards, so forum text cannot smuggle
// markup into the snippet.
const START = "\u0002";
const STOP = "\u0003";
const HEADLINE_OPTIONS = `StartSel=${START}, StopSel=${STOP}, MaxWords=18, MinWords=6, MaxFragments=2, FragmentDelimiter= … `;

export interface ForumHit {
  threadId: string;
  title: string;
  snippet: string;
  isResolved: boolean;
  hasAnswer: boolean;
}

function toSnippetHtml(raw: string): string {
  return escapeHtml(raw)
    .replaceAll(START, "<mark>")
    .replaceAll(STOP, "</mark>");
}

/**
 * Full-text search over the anonymized forum index. `faqOnly` is the public
 * cut (Cmd-K): officer-tagged FAQ posts with a marked answer. Without it,
 * everything indexed is fair game, which is what the widget's "similar
 * questions" wants -- open posts are the ones a visitor can follow.
 */
export async function searchForum(
  query: string,
  options: { limit: number; faqOnly: boolean },
): Promise<ForumHit[]> {
  const faqFilter = options.faqOnly
    ? sql`and f."isFaq" and f."answer" is not null`
    : sql``;
  const rows = await db.execute(sql`
    with "hits" as (
      select
        f."threadId",
        f."title",
        f."question",
        f."answer",
        f."isResolved",
        ts_rank(f."search", websearch_to_tsquery('english', ${query})) as "rank"
      from platform."supportForumPosts" f
      where f."search" @@ websearch_to_tsquery('english', ${query})
        ${faqFilter}
      order by "rank" desc
      limit ${options.limit}
    )
    select
      "threadId",
      "title",
      "isResolved",
      "answer" is not null as "hasAnswer",
      ts_headline(
        'english',
        coalesce("answer", "question"),
        websearch_to_tsquery('english', ${query}),
        ${HEADLINE_OPTIONS}
      ) as "snippet"
    from "hits"
    order by "rank" desc
  `);

  return (rows as unknown as ForumHit[]).map((hit) => ({
    ...hit,
    snippet: toSnippetHtml(hit.snippet),
  }));
}

/** The Cmd-K "Forum" group: published FAQ posts only. */
export async function searchForumEntries(
  query: string,
  limit = 5,
): Promise<SearchEntry[]> {
  const hits = await searchForum(query, { limit, faqOnly: true });
  return hits.map((hit) => ({
    id: `forum:${hit.threadId}`,
    title: hit.title,
    url: `/help/${hit.threadId}`,
    icon: "ChatCircleIcon" as const,
    breadcrumbs: ["Help", "Answered questions"],
    group: "forum" as const,
    snippet: hit.snippet,
  }));
}
