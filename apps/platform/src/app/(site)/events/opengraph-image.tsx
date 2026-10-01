import { pageOgImage, contentType, size } from "@devdogsuga/brand/next";

/** The link card for `/events`. Copy and colour live in `@devdogsuga/brand`. */
const card = pageOgImage("/events");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
