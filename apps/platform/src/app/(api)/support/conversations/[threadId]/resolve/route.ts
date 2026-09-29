import { NextResponse } from "next/server";
import { resolve } from "~/server/support/conversations";
import { requireVisitor, snowflake, supportRoute } from "~/server/support/http";

/** POST /support/conversations/:threadId/resolve -- the asker closes it. */
export const POST = supportRoute(
  async (
    _request,
    config,
    { params }: { params: Promise<{ threadId: string }> },
  ) => {
    const threadId = snowflake.parse((await params).threadId);
    await resolve(config, await requireVisitor(), threadId);
    return new NextResponse(null, { status: 204 });
  },
);
