import { pageOgImage, contentType, size } from "@devdogsuga/brand/next";

/** The link card for `/legal/terms`. Copy and colour live in `@devdogsuga/brand`. */
const card = pageOgImage("/legal/terms");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
