import { ImageResponse } from "next/og";
import { loadFonts } from "@devdogsuga/open-graph";
import type { ReactElement } from "react";

/**
 * Turning one of `@devdogsuga/open-graph`'s elements into the PNG Next will serve.
 *
 * ## Why `next/og` and not `@vercel/og`
 *
 * `next/og` is Next's file-convention renderer, and vinext bundles Next's own
 * vendored copy of `@vercel/og` into the Worker. A directly installed
 * `@vercel/og` would bypass that integration and duplicate the renderer.
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
