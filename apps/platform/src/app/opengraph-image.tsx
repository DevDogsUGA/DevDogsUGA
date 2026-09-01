import { PAGE_CARDS, PageCard } from "@devdogsuga/og";
import { contentType, ogResponse, size } from "~/lib/ogImage";

/**
 * The club's own card, on `/` and as the fallback under every segment that does
 * not set its own.
 *
 * Metadata files cascade, and there is no way to un-inherit one — so this is
 * also what `/console`, `/account` and the ballots unfurl as. That is the
 * intended outcome rather than a leak the cascade forced: those pages carry
 * `robots: { index: false }` and are not for sharing, but a link pasted into
 * Discord by an officer should still say DevDogs rather than nothing, and this
 * card says only what the front page says. Nothing here reads a session, a
 * param, or a row.
 *
 * The public pages each override it with their own; see `pages.ts` in
 * `@devdogsuga/og` for which ones, and why that list is the sitemap's.
 */
export const alt = "DevDogs — learn by doing";
export { contentType, size };

export default function Image() {
  return ogResponse(PageCard({ ...size, ...PAGE_CARDS["/"]! }));
}
