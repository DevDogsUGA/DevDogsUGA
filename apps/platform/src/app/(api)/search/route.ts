import { NextResponse } from "next/server";
import { canSeeCredentialsPage } from "~/server/actions/credentials";
import { getCallerContext } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { buildAppSearchEntries } from "~/server/search/appEntries";
import { searchDocs } from "~/server/search/docsSearch";
import { matchEntries } from "~/server/search/match";

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
  const docs = await searchDocs(query, 10).catch((error) => {
    console.error("[search] docs full-text search failed", error);
    return [];
  });

  return NextResponse.json([...pages, ...docs]);
}
