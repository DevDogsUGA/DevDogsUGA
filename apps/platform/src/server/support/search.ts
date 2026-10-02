import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { escapeHtml } from "~/server/search/match";
import { tsQuery, tsScore, type TsMatch } from "~/server/search/tsquery";
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
  isFaq: boolean;
  /** Tag names, as indexed. */
  tags: string[];
  /** Anonymized, cut to `PREVIEW_CHARS`. */
  question: string;
  /** Anonymized and cut like `question`, and only for FAQ posts. */
  answer: string | null;
}

/** How much of a question or answer a suggestion previews. */
const PREVIEW_CHARS = 600;

function toSnippetHtml(raw: string): string {
  return escapeHtml(raw)
    .replaceAll(START, "<mark>")
    .replaceAll(STOP, "</mark>");
}

function clip(text: string): string {
  return text.length > PREVIEW_CHARS
    ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…`
    : text;
}

/**
 * Full-text search over the anonymized forum index. `faqOnly` is the public
 * cut (Cmd-K): officer-tagged FAQ posts with a marked answer. Without it,
 * everything indexed is fair game, which is what the widget's "similar
 * questions" wants -- open posts are the ones a visitor can follow.
 */
export async function searchForum(
  query: string,
  options: { limit: number; faqOnly: boolean; match?: TsMatch },
): Promise<ForumHit[]> {
  const match = options.match ?? "all";
  const tsq = tsQuery(query, match);
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
        f."isFaq",
        f."tags",
        ${tsScore(sql`f."search"`, query, match)} as "rank"
      from platform."supportForumPosts" f
      where f."search" @@ ${tsq}
        ${faqFilter}
      order by "rank" desc
      limit ${options.limit}
    )
    select
      "threadId",
      "title",
      "isResolved",
      "isFaq",
      "tags",
      "answer" is not null as "hasAnswer",
      left("question", ${PREVIEW_CHARS + 1}) as "question",
      -- Only FAQ answers are previewed whole: an officer read those before
      -- publishing them. Others show as the highlighted snippet.
      case when "isFaq" then left("answer", ${PREVIEW_CHARS + 1}) end as "answer",
      ts_headline(
        'english',
        coalesce("answer", "question"),
        ${tsq},
        ${HEADLINE_OPTIONS}
      ) as "snippet"
    from "hits"
    order by "rank" desc
  `);

  return (rows as unknown as ForumHit[]).map((hit) => ({
    ...hit,
    snippet: toSnippetHtml(hit.snippet),
    question: clip(hit.question),
    answer: hit.answer === null ? null : clip(hit.answer),
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
