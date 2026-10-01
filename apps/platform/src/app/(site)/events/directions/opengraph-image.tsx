import { pageOgImage, contentType, size } from "@devdogsuga/brand/next";

/** The link card for `/events/directions`. Copy and colour live in `@devdogsuga/brand`. */
const card = pageOgImage("/events/directions");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
