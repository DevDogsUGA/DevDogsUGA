import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "~/supabase/server";

/**
 * Resolves the `next` param against our own origin and keeps it only if it
 * stayed there. String-concatenating it onto `origin` is not safe: a value
 * like `@evil.com` parses as URL userinfo and retargets the host.
 */
function resolveNext(next: string | null, origin: string): string {
  if (!next) return "/";
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = resolveNext(searchParams.get("next"), origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/?error=auth", origin));
}
