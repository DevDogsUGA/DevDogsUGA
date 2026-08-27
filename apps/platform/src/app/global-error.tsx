"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

/**
 * The last boundary: the root layout itself failed, so `(site)/error.tsx`
 * never mounted.
 *
 * Every style here is inline and every colour is a literal. `global-error`
 * replaces the root layout when it renders, which means it renders its own
 * document and receives **none** of the app's global stylesheet — no Tailwind
 * utilities, no mauve palette, no fonts. A className here would silently do
 * nothing, so the DevDogs dark ground is spelled out by hand rather than
 * referenced. The values are `--color-mauve-950`, `-900`, `-800` and `-400`
 * from `globals.css`, copied literally.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    // global-error must include html and body tags
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          backgroundColor: "#0c090c",
          color: "#ffffff",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>Something went wrong — DevDogs</title>
        <main style={{ maxWidth: "34rem", display: "grid", gap: "1rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 800 }}>
            DevDogs is having a moment
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "#a89ea9",
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
              paddingTop: "0.25rem",
            }}
          >
            <button
              onClick={() => retry()}
              style={{
                border: "2px solid #ffffff",
                borderRadius: "0.25rem",
                background: "#ffffff",
                color: "#000000",
                font: "inherit",
                fontSize: "0.875rem",
                fontWeight: 500,
                padding: "0.4rem 1rem",
                cursor: "pointer",
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
            <a href="/" style={{ color: "#a89ea9", fontSize: "0.875rem" }}>
              Back to the homepage
            </a>
          </div>
          {error.digest && (
            <p
              style={{
                margin: 0,
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "#79697b",
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
