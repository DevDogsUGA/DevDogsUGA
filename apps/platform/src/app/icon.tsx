import { MARK, Mark } from "@devdogsuga/open-graph";
import { imageResponse } from "~/lib/ogImage";

/**
 * The browser favicon: the DevDogs mascot on a transparent canvas, without the
 * surrounding app tile.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return imageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Mark asset={MARK} height={size.height * 0.94} />
    </div>,
    size,
  );
}
