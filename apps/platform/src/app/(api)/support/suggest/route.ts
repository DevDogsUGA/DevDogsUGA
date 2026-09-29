import { NextResponse } from "next/server";
import { searchDocs } from "~/server/search/docsSearch";
import { supportRoute } from "~/server/support/http";
import { searchForum } from "~/server/support/search";
import type { SupportSuggestion } from "~/lib/support/types";

/**
 * GET /support/suggest?q=
 *
 * "Similar questions" while the visitor types: forum posts first (answered
 * ones can end the conversation before it starts, open ones can be followed
 * instead of duplicated), then docs pages. Everything returned is from the
 * anonymized index or the public docs.
 */
export const GET = supportRoute(async (request) => {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (query.length < 4) return NextResponse.json([]);

  const [forum, docs] = await Promise.all([
    searchForum(query, { limit: 4, faqOnly: false }),
    searchDocs(query, 3),
  ]);

  const suggestions: SupportSuggestion[] = [
    ...forum.map((hit) => ({
      kind: "forum" as const,
      title: hit.title,
      snippet: hit.snippet,
      url: `/help/${hit.threadId}`,
      threadId: hit.threadId,
      status: hit.isResolved ? ("resolved" as const) : ("open" as const),
      hasAnswer: hit.hasAnswer,
    })),
    ...docs.map((entry) => ({
      kind: "doc" as const,
      title: entry.title,
      snippet: entry.snippet ?? "",
      url: entry.url,
    })),
  ];
  return NextResponse.json(suggestions);
});
