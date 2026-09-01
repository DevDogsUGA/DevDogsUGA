import { pageOgImage, contentType, size } from "~/lib/ogImage";

/** The link card for `/community`. Copy and colour live in `@devdogsuga/og`. */
const card = pageOgImage("/community");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
