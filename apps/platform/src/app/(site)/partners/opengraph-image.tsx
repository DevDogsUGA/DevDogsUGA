import { pageOgImage, contentType, size } from "~/lib/ogImage";

/** The link card for `/partners`. Copy and colour live in `@devdogsuga/og`. */
const card = pageOgImage("/partners");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
