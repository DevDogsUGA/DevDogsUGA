import { NextResponse } from "next/server";
import { getCallerContext } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { buildAppSearchEntries } from "~/server/search/appEntries";
import { searchDocs } from "~/server/search/docsSearch";
import { matchEntries } from "~/server/search/match";
import { supportConfig } from "~/server/support/config";
import { searchForumEntries } from "~/server/support/search";
import { SUPPORT_ACTION_URL, type SearchEntry } from "~/server/search/types";

/**
 * Cmd-K's way into the support widget. Not a page, so the dialog special-cases
 * its `url` and opens the widget instead of navigating (see
 * `SUPPORT_ACTION_URL`).
 */
const GET_HELP: SearchEntry = {
  id: "action:support",
  title: "Get help",
  description: "Ask the officers in the DevDogs Discord",
  url: SUPPORT_ACTION_URL,
  icon: "ChatCircleIcon",
  breadcrumbs: [],
  group: "pages",
};
const HELP_QUERY = /\b(help|support|ask|stuck|question|discord|officer)/i;

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("query") ?? "").trim();
  if (!query) return NextResponse.json([]);

  const userId = await expectSession().catch(() => null);
  const permissions = userId
    ? await getCallerContext(userId)
        .then((ctx) => ctx.resolvedPermissions)
        .catch(() => null)
    : null;

  const appEntries = buildAppSearchEntries(permissions, userId !== null);

  const pages = matchEntries(appEntries, query, 8);
  const [docs, forum] = await Promise.all([
    searchDocs(query, { limit: 10 }).catch((error) => {
      console.error("[search] docs full-text search failed", error);
      return [];
    }),
    // Anonymized FAQ posts from the support forum. Off with the widget.
    supportConfig()
      ? searchForumEntries(query, 5).catch((error) => {
          console.error("[search] forum full-text search failed", error);
          return [];
        })
      : [],
  ]);

  return NextResponse.json([
    ...(supportConfig() && HELP_QUERY.test(query) ? [GET_HELP] : []),
    ...pages,
    ...docs,
    ...forum,
  ]);
}
