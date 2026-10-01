"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { THEME_INIT_SCRIPT } from "~/config/theme-init-script";

/**
 * The last boundary: the root layout itself failed (it does an uncached
 * `db.select().from(availableTerms)` on every request), so `error.tsx` never
 * mounted -- error boundaries never catch a throw from the layout in their
 * own segment, only from what that layout renders.
 *
 * Every style here is inline and every colour is a literal, copied from
 * `src/styles/globals.css`'s `:root`/`:root.dark` tokens. `global-error`
 * replaces the root layout when it renders, so it gets its own bare
 * document -- none of `globals.css`, no Tailwind utilities, no loaded fonts,
 * nothing. A `className` here would silently do nothing. The inline
 * dark-mode script is copied from the root layout for the same reason: nothing
 * else will set `.dark` before paint here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The root layout itself failed, which is the one boundary Sentry's own
    // Next.js docs single out:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#error-handling
    // The rest of the app's Server Components/Actions/routes are captured
    // server-side in cloudflare/worker.ts; this is the client-side layer's
    // last resort, and captureException here is safe to call unconditionally
    // -- it no-ops with no DSN configured, the same as everywhere else.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    // global-error must include html and body tags
    <html lang="en">
      <head>
        <title>DogDays is having a moment</title>
        {/* Same stored-choice/system-preference toggle as the root layout's
            inline script (`THEME_INIT_SCRIPT`, byte-identical on purpose),
            reimplemented here in plain CSS variables since there is no
            Tailwind `dark:` variant to key off in this document.
            No `nonce` attribute: this is a `"use client"` component (the App
            Router's required shape for `global-error.tsx`), so it has no
            `headers()` access to the per-request nonce every other inline
            script in this app carries. It earns CSP trust instead through
            `THEME_INIT_SCRIPT_HASH`, a content hash of this exact literal --
            see that constant's doc comment and
            `scheduleBuilderCsp` (`~/config/csp.ts`). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --ge-background: #fdf2f4; /* --color-pink-50 */
                --ge-surface: #ffffff;
                --ge-edge: #fce7ec; /* --color-pink-100 */
                --ge-foreground: #18181b; /* --color-zinc-900 */
                --ge-muted: #71717a; /* --color-zinc-500 */
                --ge-primary: #b91c1c; /* --color-red-700 */
                --ge-primary-strong: #991b1b; /* --color-red-800 */
              }
              :root.dark {
                --ge-background: #17171f;
                --ge-surface: #222233;
                --ge-edge: #32324b;
                --ge-foreground: #f4f4f5; /* --color-zinc-100 */
                --ge-muted: #a6a6bd;
                --ge-primary: #dc2626; /* --color-red-600 */
                --ge-primary-strong: #b91c1c; /* --color-red-700 */
              }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          backgroundColor: "var(--ge-background)",
          color: "var(--ge-foreground)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: "34rem",
            display: "grid",
            gap: "1rem",
            textAlign: "center",
            justifyItems: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>
            DogDays is having a moment
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "var(--ge-muted)",
            }}
          >
            The page could not be built at all, which is a level above a failed
            read. Trying again is worth one attempt; if it keeps happening, let
            an officer know and quote the reference below.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: "0.25rem",
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                border: "none",
                borderRadius: "0.5rem",
                background: "var(--ge-primary)",
                color: "#ffffff",
                font: "inherit",
                fontSize: "0.875rem",
                fontWeight: 600,
                padding: "0.6rem 1.5rem",
                cursor: "pointer",
              }}
              onMouseOver={(event) => {
                event.currentTarget.style.background =
                  "var(--ge-primary-strong)";
              }}
              onMouseOut={(event) => {
                event.currentTarget.style.background = "var(--ge-primary)";
              }}
            >
              Try again
            </button>
            {/* A real navigation, not a <Link>. The root layout is the thing
                that just failed, so a client-side transition would re-enter
                the same broken tree; only a document load rebuilds it. The
                lint rule assumes a working shell, which is exactly what this
                file exists to handle the absence of. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                color: "var(--ge-muted)",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Back Home
            </a>
          </div>
          {error.digest && (
            <p
              style={{
                margin: 0,
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "var(--ge-muted)",
              }}
            >
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
