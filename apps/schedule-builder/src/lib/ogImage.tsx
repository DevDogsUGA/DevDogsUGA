import { ImageResponse } from "next/og";
import { loadFonts } from "@devdogsuga/open-graph";
import type { ReactElement } from "react";

/**
 * Turning one of `@devdogsuga/open-graph`'s elements into the PNG Next will serve.
 *
 * ## Why `next/og` and not `@vercel/og`
 *
 * They are the same library, but this app deploys to Cloudflare Workers through
 * OpenNext, and OpenNext patches Next's own vendored copy —
 * `next/dist/compiled/@vercel/og` — on the way into the Worker: it swaps the
 * Node entry for the edge one and turns the library's `fetch()` of its fallback
 * font into a bundled import, because a Worker has neither `fs` nor a relative
 * URL to fetch from. A directly-installed `@vercel/og` gets none of that
 * treatment and fails at runtime, in production only.
 *
 * `loadFonts()` returns faces embedded in the package as base64. Not read from
 * disk (there is none in a Worker) and not fetched (a second network hop, and a
 * second way for a link preview to come back blank).
 *
 * The platform carries its own copy of this at `src/lib/ogImage.tsx`. Two
 * files rather than a shared one because the reasoning is Next's and the apps
 * do not otherwise share app-level plumbing; the artwork is what lives in
 * `@devdogsuga/open-graph`.
 */
export function imageResponse(
  element: ReactElement,
  dimensions: { width: number; height: number },
): ImageResponse {
  return new ImageResponse(element, { ...dimensions, fonts: loadFonts() });
}
