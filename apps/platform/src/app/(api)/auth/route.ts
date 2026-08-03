import type { NextRequest } from "next/server";
import { startOAuthFromLink } from "~/server/auth/oauthLinkRoute";

export async function GET(request: NextRequest) {
  return await startOAuthFromLink(request);
}
