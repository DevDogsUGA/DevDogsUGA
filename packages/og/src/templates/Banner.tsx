import { ACCENT, CONTACT, MAUVE, THEME } from "../brand.js";
import {
  GDGC_UGA,
  GDGC_UGA_LIGHT,
  MARK,
  WORDMARK_ON_DARK,
  WORDMARK_ON_LIGHT,
} from "../generated/assets.js";
import { IconRow, Mark, SocialRow, Wordmark } from "../primitives.js";
import { rgba } from "./wash.js";

/**
 * The club banner: mascot, wordmark, GDG chapter cobrand, and how to find us.
 *
 * One component covers every banner slot the club fills — a 2560x650 chapter
 * header, a 1500x500 scheduling page, a 1080x1080 profile tile — because they
 * differ in two ways only, and both are derived rather than authored: the
 * layout turns from a row into a column below {@link COLUMN_BELOW}, and every
 * measurement scales off the canvas. Authoring one file per slot would mean a
 * brand change landing in some of them.
 *
 * Sizes are written against a 500-tall reference and multiplied by `u`, so the
 * 2560x650 cut is the 1500x500 one at 1.3x rather than a second set of numbers
 * that drifts from the first.
 */

/** Below this aspect ratio the lockup stacks instead of running across. */
const COLUMN_BELOW = 2;

export interface BannerProps {
  width: number;
  height: number;
  /**
   * Whether to carry the GDG on Campus lockup under the wordmark. On by
   * default: DevDogs is a GDG chapter and nearly every banner it hangs is
   * somewhere that fact belongs. Off for surfaces that are already Google's,
   * where repeating it is noise.
   */
  cobrand?: boolean;
  /**
   * `"dark"` is the site's own ground. `"light"` exists for the one place a
   * dark banner cannot go — an email body, which is white in most clients and
   * cannot be talked out of it.
   */
  ground?: "dark" | "light";
}

export function Banner({
  width,
  height,
  cobrand = true,
  ground = "dark",
}: BannerProps) {
  const column = width / height < COLUMN_BELOW;
  const dark = ground === "dark";

  // The column layout has four bands stacked in the height a row spends on
  // one, so it scales against its own reference (1000 tall) rather than the
  // row's (500). Same artwork, different budget.
  const u = column ? height / 1000 : height / 500;

  const ink = {
    background: dark ? THEME.background : "#ffffff",
    icon: dark ? MAUVE[300] : MAUVE[600],
    text: dark ? MAUVE[400] : MAUVE[700],
  };

  const markHeight = (column ? 372 : 384) * u;
  const capHeight = (column ? 82 : 85) * u;
  const gdgcHeight = ((column ? 33 : 33) * u) / GDGC_CAP_RATIO;
  const urlSize = (column ? 42 : 40) * u;
  const handleSize = (column ? 40 : 38) * u;

  const type = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: column ? "center" : "flex-start",
        gap: 0,
      }}
    >
      <Wordmark
        asset={dark ? WORDMARK_ON_DARK : WORDMARK_ON_LIGHT}
        capHeight={capHeight}
      />
      {cobrand ? (
        <img
          // The chapter mark has a ground of its own to match: its wordmark is
          // white, which is invisible on the light variant of this banner.
          src={(dark ? GDGC_UGA : GDGC_UGA_LIGHT).src}
          width={Math.round((GDGC_UGA.width / GDGC_UGA.height) * gdgcHeight)}
          height={Math.round(gdgcHeight)}
          style={{ marginTop: (column ? 42 : 26) * u }}
        />
      ) : null}
      <div
        style={{
          display: "flex",
          flexDirection: column ? "column" : "row",
          alignItems: column ? "center" : "flex-end",
          gap: (column ? 34 : 58) * u,
          marginTop: (column ? 64 : 42) * u,
        }}
      >
        <IconRow
          name="Globe"
          label={CONTACT.site}
          size={urlSize}
          iconColor={ink.icon}
          textColor={ink.text}
        />
        <SocialRow
          size={handleSize}
          iconColor={ink.icon}
          textColor={ink.text}
          handle={CONTACT.handle}
        />
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        background: ink.background,
        // Two washes of the club's own accents, so a very wide canvas does not
        // read as an empty black bar. On the root's own `backgroundImage`
        // rather than on stacked layers above it: Satori resolves `position:
        // absolute` against the flex content box, so a full-bleed layer written
        // as `left: 0, top: 0` lands at the top-left of the CENTRED CONTENT and
        // paints a hard-edged rectangle across the lower right of the image.
        ...(dark ? { backgroundImage: WASH } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: column ? "column" : "row",
          alignItems: "center",
          gap: (column ? 40 : 74) * u,
        }}
      >
        <Mark asset={MARK} height={markHeight} />
        {type}
      </div>
    </div>
  );
}

/**
 * The GDGC lockup's cap height as a fraction of the artwork's height.
 *
 * The chapter mark is a two-line block roughly 7.5:1, so its box height says
 * nothing about how large the lettering reads. Sizing it against the DevDogs
 * wordmark means converting through the capitals, the same as everything else
 * here.
 */
const GDGC_CAP_RATIO = 137 / 309;

/**
 * The background wash, as one `background-image`.
 *
 * Kept faint on purpose. It exists to give a 2560x650 strip somewhere for the
 * eye to rest, and anything stronger starts competing with the mascot — which
 * is the only thing on these banners anyone is meant to look at first. The
 * "circle" is stretched to the canvas by the time it renders, so on a wide cut
 * these are broad ellipses rather than the discs the notation suggests.
 */
const WASH = [
  `radial-gradient(circle at 20% 40%, ${rgba(ACCENT.cyan400, 0.1)}, ${rgba(ACCENT.cyan400, 0)} 45%)`,
  `radial-gradient(circle at 78% 98%, ${rgba(ACCENT.red700, 0.16)}, ${rgba(ACCENT.red700, 0)} 50%)`,
].join(", ");
