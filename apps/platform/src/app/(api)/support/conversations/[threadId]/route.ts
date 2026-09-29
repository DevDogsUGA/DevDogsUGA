import { NextResponse } from "next/server";
import { readThread } from "~/server/support/conversations";
import { requireVisitor, snowflake, supportRoute } from "~/server/support/http";

/**
 * GET /support/conversations/:threadId
 *
 * One conversation, rendered from the live Discord thread and marked read.
 * The open widget polls this every few seconds; Discord is the only copy of
 * the messages, so there is nothing to keep in sync.
 */
export const GET = supportRoute(
  async (
    _request,
    config,
    { params }: { params: Promise<{ threadId: string }> },
  ) => {
    const threadId = snowflake.parse((await params).threadId);
    const thread = await readThread(config, await requireVisitor(), threadId);
    return NextResponse.json(thread, {
      headers: { "cache-control": "private, no-store" },
    });
  },
);
