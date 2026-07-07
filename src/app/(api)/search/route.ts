import { NextResponse } from "next/server";
import { expectSession } from "~/server/auth";
import { getCallerContext } from "~/server/actions/permissions";
import { getAccessibleCredentials } from "~/server/actions/credentials";
import { getFullDocsSearchIndex } from "~/manifest/docs";
import {
  buildAppSearchEntries,
  flattenDocsToSearchEntries,
} from "~/manifest/adapters/search";
import { matchEntries } from "~/server/search/match";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query") ?? "";

  const userId = await expectSession().catch(() => null);
  const [ctx, docsPages] = await Promise.all([
    userId
      ? Promise.all([
          getCallerContext(userId),
          getAccessibleCredentials(userId),
        ])
          .then(([{ resolvedPermissions }, credentials]) => ({
            permissions: resolvedPermissions,
            credentials: credentials.map(({ id, name, description }) => ({
              id,
              name,
              description,
            })),
          }))
          .catch(() => null)
      : Promise.resolve(null),
    getFullDocsSearchIndex(),
  ]);

  const appEntries = buildAppSearchEntries(ctx);
  const docsEntries = flattenDocsToSearchEntries(docsPages);

  return NextResponse.json(
    matchEntries([...appEntries, ...docsEntries], query),
  );
}
