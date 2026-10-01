import { ImageResponse } from "next/og";
import {
  loadFonts,
  OG_SIZE,
  PAGE_CARDS,
  PageCard,
  type PageCardCopy,
} from "@devdogsuga/open-graph";
import type { ReactElement } from "react";

/**
 * The plumbing every `opengraph-image.tsx` in this app shares.
 *
 * The cards themselves live in `@devdogsuga/open-graph` so the CLI can render the same
 * artwork to disk (`pnpm devtools images`). What is left here is the part that
 * is Next's: the file-convention exports, and turning an element into a PNG.
 *
 * ## Why `next/og` and not `@vercel/og`
 *
 * `next/og` is Next's file-convention renderer, and vinext bundles Next's own
 * vendored copy of `@vercel/og` into the Worker. A directly installed
 * `@vercel/og` would bypass that integration and duplicate the renderer.
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

/**
 * One element as the PNG Next will serve, at whatever size it asks for.
 *
 * The card conventions are all 1.91:1 and go through {@link ogResponse}. The
 * icon conventions are square and two different sizes, so they come here
 * instead of carrying their own copy of the `next/og` reasoning above.
 */
export function imageResponse(
  element: ReactElement,
  dimensions: { width: number; height: number },
): ImageResponse {
  return new ImageResponse(element, { ...dimensions, fonts: loadFonts() });
}

/** Renders one of these cards as the PNG Next will serve. */
export function ogResponse(element: ReactElement): ImageResponse {
  return imageResponse(element, size);
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
      `No Open Graph copy for ${route}. Add it to @devdogsuga/open-graph's pages.ts.`,
    );

  return {
    alt: `${copy.title} — DevDogs`,
    Image: () => ogResponse(PageCard({ ...size, ...copy })),
  };
}
