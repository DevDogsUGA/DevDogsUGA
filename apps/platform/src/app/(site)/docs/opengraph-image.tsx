import { pageOgImage, contentType, size } from "@devdogsuga/brand/next";

/** The link card for `/docs`. Copy and colour live in `@devdogsuga/brand`. */
const card = pageOgImage("/docs");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
