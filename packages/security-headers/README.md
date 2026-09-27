# @devdogsuga/security-headers

The security response headers every app in the workspace sends --
`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `X-Frame-Options`, and an env-derived
`Content-Security-Policy-Report-Only` -- built once here so
`apps/platform` and `apps/schedule-builder` send the same set instead of
maintaining two copies of the allowlist that can silently drift.

## Usage

```ts
// next.config.ts
import { buildSecurityHeaders } from "@devdogsuga/security-headers";
import { env } from "~/env";

const config = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          environment: env.DEPLOY_ENV,
          supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
          sentryDsn: env.NEXT_PUBLIC_PLATFORM_SENTRY_DSN,
        }),
      },
    ];
  },
} satisfies NextConfig;
```

Wired through `next.config.ts`'s `headers()` (vinext supports the full
`rewrites`/`redirects`/`headers` phase set -- see
`node_modules/vinext/README.md`'s compatibility table) rather than
middleware, because `headers()` applies to every response the framework
serves -- including static assets -- where both apps' `middleware.ts`
matchers deliberately exclude `_next/static`/`_next/image`/favicons.

## Report-Only, not enforcing

`buildSecurityHeaders` always sets `Content-Security-Policy-Report-Only`,
never `Content-Security-Policy`. See `src/csp.ts`'s file-level comment for
the full reasoning; short version: the policy needs `'unsafe-inline'` for
`script-src`/`style-src` because Next/vinext hydration relies on inline
scripts and several components use inline `style={{ ... }}`, and neither
app's `next.config.ts` `headers()` call (evaluated once, statically, not
per-request) can mint the per-request nonce that would let `script-src`
drop `'unsafe-inline'` safely. Promoting this to an enforcing policy is
follow-up work, gated on either confirming vinext's middleware-nonce
story or wiring a `report-to` endpoint and watching Report-Only violations
in production first.

## What's in the CSP allowlist, and why

- `connect-src`/`img-src` carry the Supabase project **origin**, derived
  from the `NEXT_PUBLIC_SUPABASE_URL` input at call time -- prod
  (`https://api.devdogsuga.org`), staging, and local (`http://127.0.0.1:...`)
  all differ, so this is never hardcoded.
- `connect-src` carries the Sentry ingest **origin**, derived from
  the app's `NEXT_PUBLIC_<APP>_SENTRY_DSN` when a DSN is configured, omitted entirely
  otherwise (the normal state before the org is onboarded, and every local
  dev run -- see `@devdogsuga/telemetry`'s no-op-without-DSN contract).
- `img-src` carries `https://avatars.githubusercontent.com` unconditionally:
  the GitHub OAuth provider stores that host's `avatar_url`. Neither app
  currently renders it client-side (avatars always come from Supabase
  Storage via `useAvatarSrc`), so this is defensive allowlisting for an
  already-captured value, not a currently-exercised code path.
  Google/Discord/LinkedIn avatar hosts are deliberately **not** allowlisted
  -- those OAuth providers exist but nothing in either app reads their
  avatar URLs client-side today.
- No font CDN host: both apps use `next/font/google`, which self-hosts the
  font files at build time.

## Permissions-Policy

Denies every sensor/capability neither app uses, camera included:
`apps/platform`'s attendance check-in is a code a member types, or scans
with their **phone's own camera app** against a QR code the app displays
(`QrGenerator.tsx` renders one; nothing in either app calls
`getUserMedia`/`BarcodeDetector`/any browser scanning API).

## HSTS

Only set outside `environment: "development"` -- `vinext dev` normally
serves plain HTTP (see `apps/platform/vite.config.ts`'s `certificates/`
comment), and a browser that believes the HSTS assertion refuses to
connect over HTTP at all. Never carries `preload`: submitting to the HSTS
preload list is a one-way door, not something to opt into as a side effect
of a headers change.
