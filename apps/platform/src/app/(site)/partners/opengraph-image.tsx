import { pageOgImage, contentType, size } from "@devdogsuga/brand/next";

/** The link card for `/partners`. Copy and colour live in `@devdogsuga/brand`. */
const card = pageOgImage("/partners");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
