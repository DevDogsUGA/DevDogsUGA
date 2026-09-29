import { NextResponse } from "next/server";
import { z } from "zod";
import { startConversation } from "~/server/support/conversations";
import { LIMITS } from "~/server/support/forum";
import {
  BUDGETS,
  spend,
  subjectOf,
  supportRoute,
  visitorOrNewGuest,
} from "~/server/support/http";

const body = z.object({
  title: z
    .string()
    .trim()
    .min(4, "Give your question a short title.")
    .max(LIMITS.title, "Keep the title under 100 characters."),
  // Leaves room under Discord's 2000 for the context line the server adds.
  body: z
    .string()
    .trim()
    .min(1, "Describe what you're stuck on.")
    .max(1800, "Keep it under 1800 characters; paste long logs in a reply."),
  page: z
    .object({
      // Any same-origin path: Cmd-K opens the widget from every page, not
      // just docs. Only a docs path earns a project tag.
      path: z
        .string()
        .max(300)
        .regex(/^\/(?!\/)/),
      title: z.string().max(200),
    })
    .nullable()
    .default(null),
  turnstileToken: z.string().optional(),
});

/**
 * POST /support/conversations
 *
 * Starts a forum post. A visitor with no identity yet becomes a guest here,
 * which is where the Turnstile token is spent.
 */
export const POST = supportRoute(async (request, config) => {
  const input = body.parse(await request.json());
  const visitor = await visitorOrNewGuest(request, input.turnstileToken);
  await spend(BUDGETS.start, subjectOf(visitor));
  const result = await startConversation(config, visitor, input);
  return NextResponse.json(result, { status: 201 });
});
