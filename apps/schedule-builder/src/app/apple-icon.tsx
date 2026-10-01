import { AppIcon, THEME } from "@devdogsuga/brand";
import { imageResponse } from "@devdogsuga/brand/next";

/**
 * The iOS home-screen tile.
 *
 * The ground is painted rather than left transparent: iOS composites onto an
 * opaque square and rounds it itself, so transparency would show white behind
 * the tile's margin and the block shadow.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return imageResponse(
    AppIcon({ app: "dogdays", size: size.width, background: THEME.background }),
    size,
  );
}
