import { NextResponse } from "next/server";
import { z } from "zod";
import { reply } from "~/server/support/conversations";
import {
  BUDGETS,
  requireVisitor,
  snowflake,
  spend,
  subjectOf,
  supportRoute,
} from "~/server/support/http";

const body = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message first.")
    .max(2000, "Keep it under 2000 characters."),
});

/** POST /support/conversations/:threadId/messages -- the visitor replies. */
export const POST = supportRoute(
  async (
    request,
    config,
    { params }: { params: Promise<{ threadId: string }> },
  ) => {
    const threadId = snowflake.parse((await params).threadId);
    const input = body.parse(await request.json());
    const visitor = await requireVisitor();
    await spend(BUDGETS.reply, subjectOf(visitor));
    await reply(config, visitor, threadId, input.body);
    return new NextResponse(null, { status: 204 });
  },
);
