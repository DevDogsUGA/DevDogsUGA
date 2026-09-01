import { ImageResponse } from "next/og";
import {
  loadFonts,
  OG_SIZE,
  PAGE_CARDS,
  PageCard,
  type PageCardCopy,
} from "@devdogsuga/og";
import type { ReactElement } from "react";

/**
 * The plumbing every `opengraph-image.tsx` in this app shares.
 *
 * The cards themselves live in `@devdogsuga/og` so the CLI can render the same
 * artwork to disk (`pnpm devtools images`). What is left here is the part that
 * is Next's: the file-convention exports, and turning an element into a PNG.
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
 * ## Fonts
 *
 * `loadFonts()` returns faces embedded in the package as base64. Not read from
 * disk (there is none in a Worker) and not fetched (a second network hop, and a
 * second way for a link preview to come back blank).
 */

/** Every card in this app is the same size; social networks want 1.91:1. */
export const size = OG_SIZE;

export const contentType = "image/png";

/** Renders one of these cards as the PNG Next will serve. */
export function ogResponse(element: ReactElement): ImageResponse {
  return new ImageResponse(element, { ...size, fonts: loadFonts() });
}

/**
 * The whole of a static page's `opengraph-image.tsx`, given its route.
 *
 * The copy comes from `PAGE_CARDS`, keyed by the same route strings
 * `sitemap.ts` publishes, so a page that is in the sitemap has a card and a
 * page that is not does not. Throwing on a missing key is deliberate: the
 * alternative is a card that renders with an empty title, which nothing catches
 * until somebody shares the link.
 */
export function pageOgImage(route: string) {
  const copy: PageCardCopy | undefined = PAGE_CARDS[route];
  if (!copy)
    throw new Error(
      `No Open Graph copy for ${route}. Add it to @devdogsuga/og's pages.ts.`,
    );

  return {
    alt: `${copy.title} — DevDogs`,
    Image: () => ogResponse(PageCard({ ...size, ...copy })),
  };
}
