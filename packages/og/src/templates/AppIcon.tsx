import { APPS, type AppKey } from "../apps.js";
import { THEME } from "../brand.js";
import { MARK } from "../generated/assets.js";
import { DogDaysMark, DogPackMark } from "../marks.js";
import { Mark, Tile } from "../primitives.js";

/**
 * One app's icon: its mark, on its colour, with the border and block shadow
 * the rest of the site is drawn with.
 *
 * Everything scales off `size`, so 32 and 1024 are the same artwork rather than
 * two drawings. The proportions are fixed as fractions of the canvas, which is
 * what keeps a favicon recognisable as the same object as the 512px PWA icon
 * beside it.
 *
 * Below roughly 48px the border and shadow are a pixel each and stop reading as
 * separate shapes — the icon degrades into a coloured rounded square with a
 * mark on it, which is the right thing for it to degrade into. It is drawn
 * rather than skipped so a 32px favicon and a 512px icon are never two
 * different marks.
 */
export interface AppIconProps {
  app: AppKey;
  size: number;
  /**
   * Fills the corners outside the tile instead of leaving them transparent.
   * Wanted by the surfaces that composite an icon onto their own background and
   * round it themselves — iOS home screens, most notably, which paint an opaque
   * square behind anything transparent and would otherwise show white.
   */
  background?: string;
}

export function AppIcon({ app, size, background }: AppIconProps) {
  const brand = APPS[app];

  // Fractions of the canvas, so the shadow keeps its distance at every size.
  // The tile is inset by exactly the shadow's throw plus the outer margin: a
  // box-shadow is drawn outside the border box, and anything that does not
  // leave room for it gets it clipped by the image edge.
  const margin = size * 0.06;
  const shadow = size * 0.055;
  const border = Math.max(1, size * 0.035);
  const tile = size - margin * 2 - shadow;
  const radius = tile * 0.22;

  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        background: background ?? "transparent",
      }}
    >
      <div
        style={{ display: "flex", marginRight: shadow, marginBottom: shadow }}
      >
        <Tile
          size={tile}
          fill={brand.ground}
          radius={radius}
          border={border}
          shadow={shadow}
        >
          <AppMark app={app} size={tile * 0.62} color={brand.mark} />
        </Tile>
      </div>
    </div>
  );
}

function AppMark({
  app,
  size,
  color,
}: {
  app: AppKey;
  size: number;
  color: string;
}) {
  if (app === "dogdays") return <DogDaysMark size={size} color={color} />;
  if (app === "dogpack") return <DogPackMark size={size} color={color} />;

  // The platform's mark is the mascot, which is full-colour artwork and taller
  // than it is wide. Sized by height so it fills the tile the way the
  // one-colour marks do, and left uncoloured — `color` is meaningless for it.
  return <Mark asset={MARK} height={size} />;
}

/** Kept beside the icon so a caller tinting a mark has the ink to hand. */
export const ICON_INK = THEME.ink;
