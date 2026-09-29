import { NextResponse } from "next/server";
import { z } from "zod";
import { follow } from "~/server/support/conversations";
import {
  BUDGETS,
  snowflake,
  spend,
  subjectOf,
  supportRoute,
  visitorOrNewGuest,
} from "~/server/support/http";

const body = z.object({ turnstileToken: z.string().max(2048).optional() });

/**
 * POST /support/conversations/:threadId/follow
 *
 * "Me too" on a similar question: joins an existing post instead of starting
 * a duplicate. Like starting one, this can be a guest's first action.
 */
export const POST = supportRoute(
  async (
    request,
    config,
    { params }: { params: Promise<{ threadId: string }> },
  ) => {
    const threadId = snowflake.parse((await params).threadId);
    const input = body.parse(await request.json().catch(() => ({})));
    const visitor = await visitorOrNewGuest(request, input.turnstileToken);
    await spend(BUDGETS.follow, subjectOf(visitor));
    await follow(config, visitor, threadId);
    return new NextResponse(null, { status: 204 });
  },
);
