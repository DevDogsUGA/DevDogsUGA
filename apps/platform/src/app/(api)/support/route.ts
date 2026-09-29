import { NextResponse } from "next/server";
import { getInbox } from "~/server/support/conversations";
import { supportRoute } from "~/server/support/http";
import { currentVisitor } from "~/server/support/identity";

/**
 * GET /support
 *
 * The widget's inbox: who the viewer is and their conversations with unread
 * state. The launcher polls this for its badge, so it costs one Discord
 * request however many conversations there are (see `getInbox`).
 */
export const GET = supportRoute(async (_request, config) => {
  const inbox = await getInbox(config, await currentVisitor());
  return NextResponse.json(inbox, {
    headers: { "cache-control": "private, no-store" },
  });
});
