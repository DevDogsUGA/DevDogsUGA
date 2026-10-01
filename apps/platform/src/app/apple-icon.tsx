import { AppIcon, THEME } from "@devdogsuga/brand";
import { imageResponse } from "@devdogsuga/brand/next";

/**
 * The iOS home-screen tile.
 *
 * 180 is the size iOS asks for. The ground is painted rather than left
 * transparent because iOS composites onto an opaque square and rounds it
 * itself, so a transparent PNG would put the tile's margin and the block
 * shadow's black on white.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return imageResponse(
    AppIcon({
      app: "platform",
      size: size.width,
      background: THEME.background,
    }),
    size,
  );
}
