import { pageOgImage, contentType, size } from "@devdogsuga/brand/next";

/** The link card for `/legal/privacy`. Copy and colour live in `@devdogsuga/brand`. */
const card = pageOgImage("/legal/privacy");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
