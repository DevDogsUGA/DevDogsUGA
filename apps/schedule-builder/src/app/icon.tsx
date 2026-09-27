import { AppIcon } from "@devdogsuga/open-graph";
import { imageResponse } from "~/lib/ogImage";

/**
 * The favicon, generated rather than committed.
 *
 * The same `AppIcon` the CLI renders to disk for the loose sizes, so DogDays'
 * tab icon and its store artwork are one drawing.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return imageResponse(AppIcon({ app: "dogdays", size: size.width }), size);
}
