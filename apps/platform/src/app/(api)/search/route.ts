import { NextResponse } from "next/server";
import { canSeeCredentialsPage } from "~/server/actions/credentials";
import { getCallerContext } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { buildAppSearchEntries } from "~/server/search/appEntries";
import { searchDocs } from "~/server/search/docsSearch";
import { matchEntries } from "~/server/search/match";
import { supportConfig } from "~/server/support/config";
import { searchForumEntries } from "~/server/support/search";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("query") ?? "").trim();
  if (!query) return NextResponse.json([]);

  const userId = await expectSession().catch(() => null);
  const [permissions, credentialsAccess] = userId
    ? await Promise.all([
        getCallerContext(userId)
          .then((ctx) => ctx.resolvedPermissions)
          .catch(() => null),
        canSeeCredentialsPage(userId).catch(() => false),
      ])
    : [null, false];

  const appEntries = buildAppSearchEntries(
    permissions,
    credentialsAccess,
    userId !== null,
  );

  const pages = matchEntries(appEntries, query, 8);
  const [docs, forum] = await Promise.all([
    searchDocs(query, 10).catch((error) => {
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

  return NextResponse.json([...pages, ...docs, ...forum]);
}
