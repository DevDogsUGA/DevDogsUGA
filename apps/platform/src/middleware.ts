import { type NextRequest } from "next/server";
import { updateSession } from "~/supabase/proxy";

// Uses the legacy `middleware.ts` convention rather than Next 16's `proxy.ts`
// because proxy.ts runs only on the Node.js runtime, which the OpenNext
// Cloudflare adapter does not support. middleware.ts runs on the Edge runtime,
// and the session refresh only uses edge-safe APIs (@supabase/ssr).
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
