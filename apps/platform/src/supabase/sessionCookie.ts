/**
 * Whether a cookie is a Supabase session cookie.
 *
 * `@supabase/ssr` names its session cookie `sb-<project-ref>-auth-token`, and
 * splits it into `.0`/`.1` parts when the value outgrows a single cookie, so
 * match on the shape rather than an exact name.
 *
 * The PKCE verifier written when an OAuth flow *starts* is named
 * `sb-<project-ref>-auth-token-code-verifier`, which fits that shape without
 * being a session. Excluding it matters: a signed-out visitor who merely
 * reached the sign-in redirect would otherwise carry it for the rest of the
 * browsing session and be treated as possibly signed in on every request.
 *
 * Shared by middleware (`./proxy`), which skips the session refresh without
 * one, and the navbar (`NavUserProvider`), which skips fetching `/me`. The
 * cookie isn't `httpOnly` (the browser Supabase client reads it), so both
 * sides see the same thing.
 */
export function isSessionCookieName(name: string): boolean {
  return (
    name.startsWith("sb-") &&
    name.includes("auth-token") &&
    !name.endsWith("-code-verifier")
  );
}
