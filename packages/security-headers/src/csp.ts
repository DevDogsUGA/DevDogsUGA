/**
 * Builds the workspace's CSP value (still sent Report-Only for now -- see
 * `buildSecurityHeaders`).
 *
 * `script-src` carries a per-request nonce (`'nonce-…' 'strict-dynamic'`),
 * not `'unsafe-inline'`. vinext (`node_modules/vinext/dist/server/csp.js`,
 * `getScriptNonceFromHeaderSources`) replicates Next's documented
 * middleware-nonce wiring exactly
 * (https://nextjs.org/docs/app/guides/content-security-policy): it reads a
 * `'nonce-…'` value off either the `Content-Security-Policy` or the
 * `Content-Security-Policy-Report-Only` header on the *request* (not just
 * the response) and threads it through `app-ssr-entry.js`/`app-rsc-handler.js`
 * into every script/style tag it emits itself (bootstrap module,
 * `__NEXT_DATA__`, font preloads, `next/script`). That means the nonce can be
 * (and is) wired end-to-end while this header is still Report-Only -- vinext
 * reads a nonce out of the Report-Only header source just as readily as the
 * enforcing one. Middleware (`apps/*\/src/middleware.ts`) mints the nonce and
 * writes it onto the *request* headers (not just the response) precisely so
 * vinext's renderer can see it. Every hand-written inline `<script>` in
 * either app (the announcement-hide script and JSON-LD in `apps/platform`,
 * the dark-mode flash-prevention script in `apps/schedule-builder` and its
 * `global-error.tsx`) reads the same nonce via `headers()`/a prop and stamps
 * it on manually -- vinext only nonces scripts it emits itself.
 *
 * Every directive below is derived from what the two apps actually load,
 * not hand-guessed:
 *   - `connect-src`/`img-src` include the Supabase project origin, taken
 *     from `NEXT_PUBLIC_SUPABASE_URL` -- prod, staging, and local all differ,
 *     so this is computed from the env var rather than hardcoded.
 *   - `connect-src` includes the Sentry ingest origin, taken from
 *     the app's `NEXT_PUBLIC_<APP>_SENTRY_DSN` when a DSN is configured (see
 *     `apps/*\/src/instrumentation-client.ts` -- both apps browser-init
 *     Sentry error capture only, no tracing/replay).
 *   - `img-src` includes `avatars.githubusercontent.com`: the GitHub OAuth
 *     provider (`apps/platform/src/server/auth/providers/github.ts`) stores
 *     the account's `avatar_url` from that host. The app currently renders
 *     avatars only from Supabase Storage (`useAvatarSrc`), never that raw
 *     provider URL directly, but it is allowlisted defensively since the
 *     value is already captured and a future direct render is plausible.
 *     Google/Discord/LinkedIn avatar hosts are NOT included: those providers
 *     exist (`server/auth/providers/{google,discord,linkedin}.ts`) but
 *     nothing in either app currently reads their avatar URLs client-side,
 *     and the task narrowing was "if used."
 *   - No `fonts.googleapis.com`/`fonts.gstatic.com`: both apps use
 *     `next/font/google` (`apps/*\/src/app/layout.tsx`), which self-hosts
 *     the font files at build time -- no runtime request to Google's font
 *     CDN, so no allowlist entry earned.
 */

export interface CspInput {
  /** `NEXT_PUBLIC_SUPABASE_URL` -- the app's Supabase project URL. */
  supabaseUrl: string;
  /**
   * the app's `NEXT_PUBLIC_<APP>_SENTRY_DSN`, if the service has been onboarded to Sentry.
   * Falsy (`undefined`/`null`/`""`) is the normal state before onboarding
   * and in every local dev run -- treated the same as "no Sentry ingest
   * host to allow."
   */
  sentryDsn?: string | null;
  /**
   * Per-request nonce, minted in `middleware.ts` (`crypto.getRandomValues`,
   * base64), that gates `script-src`. Required, not optional: there is no
   * safe fallback value -- a caller building a real response must always
   * have minted one.
   */
  nonce: string;
  /**
   * Gates `'unsafe-eval'` on `script-src`, scoped to `"development"` only --
   * Vite/React Fast Refresh needs `eval` in dev; staging and production
   * never should.
   */
  environment: "development" | "staging" | "production";
  /**
   * Extra `script-src` source expressions (typically `'sha256-…'` hashes)
   * for inline scripts that cannot carry the per-request nonce. The one
   * caller today is `apps/schedule-builder`'s `global-error.tsx`: it is a
   * `"use client"` component (the App Router requires that), so it has no
   * access to `headers()`/the request-scoped nonce the rest of the app's
   * inline scripts read. Its dark-mode script is a fixed, build-time
   * literal (`~/config/theme-init-script.ts`), so a content hash is exactly
   * as strong a trust anchor as a nonce would be, and CSP3 keeps hash
   * sources trusted alongside `'strict-dynamic'` (only host/scheme sources
   * and `'unsafe-inline'` are the ones a `'strict-dynamic'`-aware browser
   * ignores).
   */
  extraScriptSources?: string[];
  /**
   * Extra host sources for the fetch directives an app's own features need
   * beyond the shared baseline. Kept per app rather than widened here for
   * everyone: apps/platform's docs support widget renders Discord's CDN and
   * frames Turnstile, and schedule-builder has no reason to allow either.
   */
  extraSources?: {
    img?: string[];
    media?: string[];
    frame?: string[];
  };
}

/** Origin (`scheme://host[:port]`) of a URL string, or `null` if unparseable. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(input: CspInput): string {
  const supabaseOrigin = originOf(input.supabaseUrl);
  const sentryOrigin = input.sentryDsn ? originOf(input.sentryDsn) : null;

  const connectSrc = [
    "'self'",
    ...(supabaseOrigin ? [supabaseOrigin] : []),
    ...(sentryOrigin ? [sentryOrigin] : []),
  ];

  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    ...(supabaseOrigin ? [supabaseOrigin] : []),
    "https://avatars.githubusercontent.com",
    ...(input.extraSources?.img ?? []),
  ];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    // Belt-and-suspenders with the `X-Frame-Options: DENY` header set
    // alongside this policy -- `frame-ancestors` is the CSP-native
    // replacement `X-Frame-Options` predates, kept together for browsers
    // that only understand one of the two.
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "img-src": imgSrc,
    "font-src": ["'self'", "data:"],
    // `'unsafe-inline'` for style: Next/vinext hydration and several
    // components (e.g. dynamic inline `style={{ ... }}` colors) rely on
    // inline styles, and there is no nonce/hash wiring for style the way
    // there now is for script (React itself injects hoisted `<style>` tags
    // with no nonce hook). Left as `'unsafe-inline'` deliberately -- out of
    // scope for the script-src nonce spike described in the file-level
    // doc comment above.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Nonce + `'strict-dynamic'`, not `'unsafe-inline'`: see the file-level
    // doc comment above. `'self'` stays alongside as a no-op fallback for
    // the handful of browsers that honor `script-src` host sources but not
    // `'strict-dynamic'` (which, per the CSP3 spec, makes every other
    // token except nonces/hashes moot in browsers that DO understand it).
    // `'unsafe-eval'` is dev-only, for Vite/React Fast Refresh.
    "script-src": [
      "'self'",
      `'nonce-${input.nonce}'`,
      "'strict-dynamic'",
      ...(input.environment === "development" ? ["'unsafe-eval'"] : []),
      ...(input.extraScriptSources ?? []),
    ],
    "connect-src": connectSrc,
    "worker-src": ["'self'", "blob:"],
    ...(input.extraSources?.media
      ? { "media-src": ["'self'", ...input.extraSources.media] }
      : {}),
    ...(input.extraSources?.frame
      ? { "frame-src": ["'self'", ...input.extraSources.frame] }
      : {}),
    "manifest-src": ["'self'"],
  };

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}
