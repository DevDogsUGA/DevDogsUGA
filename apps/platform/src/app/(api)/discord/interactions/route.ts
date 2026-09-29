import type { NextRequest } from "next/server";
import { handleInteraction } from "~/server/support/interactions";

/**
 * POST /discord/interactions
 *
 * The bot's Interactions Endpoint URL (set per environment in the Discord
 * developer portal). Not `/discord` itself: next.config.ts redirects that
 * path to the server invite, and a redirect answers every method.
 */
export async function POST(request: NextRequest) {
  return handleInteraction(request);
}
