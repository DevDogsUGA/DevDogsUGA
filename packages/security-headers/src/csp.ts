/**
 * Builds the workspace's `Content-Security-Policy-Report-Only` value.
 *
 * ⚠️ REPORT-ONLY, DELIBERATELY, and that is the whole reason this can ship
 * without a nonce. A real (enforcing) CSP that allows inline `<script>` tags
 * with `'unsafe-inline'` is close to no policy at all for script injection --
 * the one thing a strict CSP is usually for. The workspace-approved fix is a
 * per-request nonce threaded from middleware through to every inline script
 * Next/vinext emits, but neither app's `next.config.ts` `headers()` (a static
 * declaration, evaluated once at build/dev-server start, not per request) can
 * mint one, and vinext's own docs (`node_modules/vinext/README.md`) do not
 * document whether it replicates Next's middleware-nonce wiring
 * (https://nextjs.org/docs/app/guides/content-security-policy) for RSC/SSR
 * script injection. Wiring a nonce blind, on an enforcing policy, risks
 * silently breaking hydration in production. `'unsafe-inline'` here buys
 * real, safe-to-land observability now (every violation still gets reported
 * to devtools' console / a future `report-to` endpoint) while a nonce spike
 * happens as separate, isolated follow-up work before this policy is ever
 * promoted out of Report-Only.
 *
 * Every directive below is derived from what the two apps actually load,
 * not hand-guessed:
 *   - `connect-src`/`img-src` include the Supabase project origin, taken
 *     from `NEXT_PUBLIC_SUPABASE_URL` -- prod, staging, and local all differ,
 *     so this is computed from the env var rather than hardcoded.
 *   - `connect-src` includes the Sentry ingest origin, taken from
 *     `NEXT_PUBLIC_SENTRY_DSN` when a DSN is configured (see
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
   * `NEXT_PUBLIC_SENTRY_DSN`, if the service has been onboarded to Sentry.
   * Falsy (`undefined`/`null`/`""`) is the normal state before onboarding
   * and in every local dev run -- treated the same as "no Sentry ingest
   * host to allow."
   */
  sentryDsn?: string | null;
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
    // inline styles. Report-only, same trade-off as script-src below.
    "style-src": ["'self'", "'unsafe-inline'"],
    // `'unsafe-inline'` for script: see the file-level doc comment above.
    "script-src": ["'self'", "'unsafe-inline'"],
    "connect-src": connectSrc,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}
