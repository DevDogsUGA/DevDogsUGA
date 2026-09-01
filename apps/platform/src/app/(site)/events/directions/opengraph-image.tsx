import { pageOgImage, contentType, size } from "~/lib/ogImage";

/** The link card for `/events/directions`. Copy and colour live in `@devdogsuga/og`. */
const card = pageOgImage("/events/directions");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
