import { pageOgImage, contentType, size } from "~/lib/ogImage";

/** The link card for `/legal/privacy`. Copy and colour live in `@devdogsuga/open-graph`. */
const card = pageOgImage("/legal/privacy");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
