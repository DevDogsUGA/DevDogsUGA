import { pageOgImage, contentType, size } from "~/lib/ogImage";

/** The link card for `/docs`. Copy and colour live in `@devdogsuga/og`. */
const card = pageOgImage("/docs");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
