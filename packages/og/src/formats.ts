/**
 * The sizes a graphic can be rendered at, and what wants each one.
 *
 * A **format** is a rendition; a **graphic** is a subject. They are two axes,
 * and keeping them apart is what lets "the September 8 meeting" and "the GDG
 * chapter banner size" be asked for independently — which is the whole point,
 * because an event poster for the GDG platform is exactly that pairing and
 * nothing enumerated it before.
 *
 * Not every pairing exists. `savvycal` is one cover on one scheduling page and
 * belongs to the club lockup alone; an app icon has no meaning at 2560x650.
 * Each graphic declares the formats it supports, and the CLI's registry is
 * where that lives — this file only says how big each rendition is.
 */

/** Which template shape a format calls for. */
export type FormatFamily = "card" | "email" | "icon";

export interface Format {
  name: string;
  /** The layout's coordinate space; every size in a template is against this. */
  width: number;
  height: number;
  /**
   * Output pixels per layout pixel.
   *
   * The layout is computed once at `width` and the vector result rasterised
   * larger, so a 3x export is genuinely three times the detail and the type
   * sits on identical metrics at every scale. It is also how the icon sizes
   * work: one 512px layout, scaled down, so a 16px favicon is the same drawing
   * as the 1024px store asset rather than a separate one whose 0.56px border
   * Satori would round away.
   */
  scale: number;
  family: FormatFamily;
  /** One line: what asks for this size. */
  why: string;
}

/** Facebook and X both render Open Graph art at 1.91:1. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The email signature's aspect: 360x108 at 1x, a common signature column. */
export const EMAIL_SIGNATURE_ASPECT = 10 / 3;

const EMAIL = { width: 360, height: 108 };

/** The pixel sizes an app icon is asked for, and who asks. */
const ICON_SIZES: Record<number, string> = {
  16: "favicon, the smallest a browser tab draws",
  32: "favicon at 2x, and Windows shortcut tiles",
  48: "Windows shortcut tiles at 1x",
  64: "browser bookmark bars",
  96: "Android launcher, low density",
  128: "Chrome Web Store and desktop shortcuts",
  180: "iOS home screen (apple-touch-icon)",
  192: "the smaller of the two a web app manifest must carry",
  256: "Windows tiles at 2x",
  384: "Android launcher, extra-high density",
  512: "the larger of the two a web app manifest must carry",
  1024: "App Store and Play Console source artwork",
};

function iconFormats(): Record<string, Format> {
  const formats: Record<string, Format> = {};

  for (const [size, why] of Object.entries(ICON_SIZES)) {
    formats[`icon-${size}`] = {
      name: `icon-${size}`,
      // Laid out at 512 whatever the target, then scaled. See `Format.scale`.
      width: 512,
      height: 512,
      scale: Number(size) / 512,
      family: "icon",
      why: `${size}px — ${why}.`,
    };
  }

  return formats;
}

export const FORMATS: Record<string, Format> = {
  og: {
    name: "og",
    ...OG_SIZE,
    scale: 1,
    family: "card",
    why: "The link card a URL unfurls as, on every social network and in Discord.",
  },
  "gdgc-wide": {
    name: "gdgc-wide",
    width: 2560,
    height: 650,
    scale: 1,
    family: "card",
    why: "The banner the GDG on Campus platform shows above a chapter or an event.",
  },
  "gdgc-square": {
    name: "gdgc-square",
    width: 1080,
    height: 1080,
    scale: 1,
    family: "card",
    why: "The square the GDG platform and every social profile crop to.",
  },
  savvycal: {
    name: "savvycal",
    width: 1500,
    height: 500,
    scale: 1,
    family: "card",
    why: "The cover on the club's SavvyCal scheduling links.",
  },
  "email-1x": {
    name: "email-1x",
    ...EMAIL,
    scale: 1,
    family: "email",
    why: "Email signature at the size the <img> is set to in HTML.",
  },
  "email-2x": {
    name: "email-2x",
    ...EMAIL,
    scale: 2,
    family: "email",
    why: "Email signature for a retina screen.",
  },
  "email-3x": {
    name: "email-3x",
    ...EMAIL,
    scale: 3,
    family: "email",
    why: "Email signature at the highest density worth shipping.",
  },
  ...iconFormats(),
  // The two Next serves from a file convention. Same artwork as icon-512 and
  // icon-180, and separate formats rather than a special case because they are
  // separate OUTPUTS: they land in `src/app/` under names the framework picks,
  // and a graphic can support these without supporting the loose sizes.
  "icon-favicon": {
    name: "icon-favicon",
    width: 512,
    height: 512,
    scale: 1,
    family: "icon",
    why: "Next's `app/icon.png` convention — the favicon, with no code.",
  },
  "icon-apple": {
    name: "icon-apple",
    width: 512,
    height: 512,
    scale: 180 / 512,
    family: "icon",
    why: "Next's `app/apple-icon.png` convention — the iOS home-screen tile.",
  },
};

/**
 * Formats whose artwork must be drawn on an opaque ground.
 *
 * iOS paints a white square behind anything transparent, which would put the
 * block shadow's black on white and the tile's margin on white too. The
 * difference between an icon and an icon in a white box.
 */
export const OPAQUE_FORMATS = new Set(["icon-apple"]);

export type FormatName = keyof typeof FORMATS;

/** Every format in a family, in declaration order. */
export function formatsIn(family: FormatFamily): Format[] {
  return Object.values(FORMATS).filter((format) => format.family === family);
}

/** The card renditions, which is what every graphic is asked to support. */
export const CARD_FORMATS = formatsIn("card").map((format) => format.name);

/**
 * How a card lays itself out at a given aspect.
 *
 * Three shapes rather than one that stretches, because 2560x650 and 1080x1080
 * are not the same picture at different sizes — one has room for a column of
 * detail and no height, the other the reverse. The thresholds sit well clear of
 * the three real aspects (1.0, 1.91, 3.94) so a new size lands predictably.
 */
export function cardLayout(width: number, height: number): CardLayout {
  const aspect = width / height;
  if (aspect >= 3) return "wide";
  if (aspect <= 1.2) return "square";

  return "standard";
}

export type CardLayout = "wide" | "square" | "standard";

/**
 * The canvas width each layout's sizes are written against.
 *
 * Every measurement in a card is a number times `u`, and `u` is the canvas
 * width over the reference below. Scaling by WIDTH rather than height is what
 * makes the square work: at 1080x1080 a height-derived scale is 1.71, so the
 * type grew by three quarters while the canvas got NARROWER than the 1200px
 * reference, and a two-line title became a five-line one running off the
 * bottom. Width is the dimension that decides whether a line fits.
 */
export const CARD_REFERENCE_WIDTH: Record<CardLayout, number> = {
  standard: 1200,
  square: 1080,
  // Deliberately well under the 2560 it renders at. A banner is read across a
  // room and from a feed, so type sized as if the canvas were 1900 wide comes
  // out about a third larger than the link card's — which is what the extra
  // pixels are for. The height still has to hold it; 650px does, with room.
  wide: 1900,
};
