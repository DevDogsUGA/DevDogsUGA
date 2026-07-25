import { type NextRequest } from "next/server";
import { updateSession } from "~/supabase/middleware";

const PUBLIC_PATHS = [
  "/",
  "/auth/callback",
  "/courses",
  "/plans",
  "/generate-schedule",
  "/manual-entry",
  "/questionnaire",
  "/past-credits",
  "/credit-data",
  "/settings",
  "/survey",
  "/route-map",
  "/distance-page",
];

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.searchParams.set("next", pathname);
    return Response.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
