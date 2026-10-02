import { NextResponse } from "next/server";
import { searchDocs } from "~/server/search/docsSearch";
import { SUPPORT_TAGS } from "~/server/support/config";
import { supportRoute } from "~/server/support/http";
import { searchForum } from "~/server/support/search";
import type { SupportSuggestions } from "~/lib/support/types";

const STATUS_TAGS = new Set(
  Object.values(SUPPORT_TAGS).map((name) => name.toLowerCase()),
);

/**
 * GET /support/suggest?q=&project=
 *
 * "Similar questions" while the visitor types: forum posts (answered ones can
 * end the conversation before it starts, open ones can be followed instead
 * of duplicated) and docs pages, kept apart so the widget can show them
 * apart. Everything returned is from the anonymized index or the public docs.
 * `project`, the docs project the visitor is reading, wins ties among pages.
 */
export const GET = supportRoute(async (request) => {
  const query = (request.nextUrl.searchParams.get("q") ?? "")
    .trim()
    .slice(0, 200);
  const project = request.nextUrl.searchParams.get("project")?.slice(0, 100);
  const empty: SupportSuggestions = { questions: [], docs: [] };
  if (query.length < 4) return NextResponse.json(empty);

  const [forum, docs] = await Promise.all([
    // Any word, not all: the query is the visitor's draft, not search terms.
    searchForum(query, { limit: 5, faqOnly: false, match: "any" }),
    // Over-fetched: projects share pages (each has a "Running the project"),
    // and only the first copy of each, the preferred project's, is kept.
    searchDocs(query, { limit: 10, match: "any", preferProject: project }),
  ]);

  const suggestions: SupportSuggestions = {
    questions: forum.map((hit) => ({
      threadId: hit.threadId,
      title: hit.title,
      status: hit.isResolved ? "resolved" : "open",
      hasAnswer: hit.hasAnswer,
      isFaq: hit.isFaq,
      tags: hit.tags.filter((tag) => !STATUS_TAGS.has(tag.toLowerCase())),
      question: hit.question,
      answer: hit.answer,
      snippet: hit.snippet,
    })),
    docs: docs
      .filter(
        (entry, i) => docs.findIndex((d) => d.title === entry.title) === i,
      )
      .slice(0, 4)
      .map((entry) => ({
        title: entry.title,
        description: entry.description ?? null,
        // "Docs" leads every trail; the dialog's section heading says it.
        breadcrumbs: entry.breadcrumbs.slice(1),
        snippet: entry.snippet ?? "",
        url: entry.url,
      })),
  };
  return NextResponse.json(suggestions);
});
