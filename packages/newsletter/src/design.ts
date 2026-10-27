/**
 * The Changelog's two design-system themes as one table of tokens.
 *
 * Both are finishes over the SAME structure (terminal window, prompt lines,
 * `##` labels, tonight card, upcoming rows with a date column, quiet boxes,
 * footer); everything that differs lives here, so tuning the design means
 * editing this file (draft 11 of the design system is still moving).
 *
 *  - `cosmic` ("Arcade", DevDogs issues): the dark mauve Changelog, restyled
 *    with pixel art, stepped corners and hard drop shadows.
 *  - `paper` (GDGC issues): flat pastel ground, white cards with ink outlines,
 *    Google Sans, flat Fluent emoji. Light-native, so it ships a dark twin
 *    (`PAPER_DARK`) exactly like the GDGC campaign layout does.
 *
 * Email safety rules the tokens obey: every color here is a flat hex that
 * `darkmode.ts` can class and pin; stepped corners / shadows / glows are
 * stylesheet-only enhancements (`pixelCss`) over a square, bgcolor-painted
 * base that classic Outlook renders as-is.
 */
import {
  GDGC,
  GDGC_FONT_STACK,
  EMAIL_FONTS,
  KIND,
  PALETTE,
  UGA,
  type FontStacks,
} from "./theme.js";
import { KIND as SDK_KIND } from "@devdogsuga/sdk/brand";

export type ThemeName = "cosmic" | "paper";

export type KindKey =
  "build" | "interest" | "workshop" | "demo" | "social" | "study";

/**
 * A meeting's resolved category to its theme key. The theme keeps its older
 * `interest` and `demo` names for `info` and `milestone`: the hosted glow
 * images are filed under them. Unknown categories read as a workshop.
 */
export function kindKey(category: string | null | undefined): KindKey {
  switch (category) {
    case "build":
      return "build";
    case "info":
      return "interest";
    case "milestone":
      return "demo";
    case "social":
      return "social";
    case "study":
      return "study";
    default:
      return "workshop";
  }
}

/**
 * Decor by what the night is, matched on its title: a bug for the Bug Bash, a
 * trophy for Demo Day. First match wins; anything unmatched takes its kind's
 * art. Until the series redesign gives each series its own icon, this is
 * where a new recurring night gets one.
 */
export const EVENT_ART: [RegExp, string][] = [
  [/bug bash/i, "bug"],
  [/merge monday|build session/i, "laptop"],
  [/workshop/i, "light_bulb"],
  [/kickoff|cold start/i, "rocket"],
  [/checkpoint/i, "triangular_flag"],
  [/demo/i, "trophy"],
  [/touch grass/i, "deciduous_tree"],
  [/interest meeting|info session/i, "megaphone"],
];

/** The sprite/emoji stem for an event: its title's match in `EVENT_ART`, else its kind's. */
export function eventArt(title: string, kind: KindKey): string {
  return (
    EVENT_ART.find(([pattern]) => pattern.test(title))?.[1] ?? KIND_ART[kind]
  );
}

/** Per-kind decor shared by both themes: the sprite/emoji name (the file stem under `theme/`). */
export const KIND_ART: Record<KindKey, string> = {
  build: "laptop",
  interest: "megaphone",
  workshop: "triangular_flag",
  demo: "trophy",
  social: "party_popper",
  study: "light_bulb",
};

export interface KindTheme {
  /** Cosmic: the light accent (outline, date bar, label). Paper: the strong bar color. */
  bar: string;
  /** Cosmic: the dark twin used for the hard shadow and title shadow. Paper: unused. */
  shadow: string;
  /** Paper: the pastel chip and tonight-card fill. */
  fill: string;
  /** The event row's date column and its primary button: Cosmic takes the kind's 700 under white text (at
   * least 5:1, and light-on-dark survives the dark modes that flip dark text); Paper the halftone under ink. */
  date: string;
  dateInk: string;
}

/** One Cosmic kind from the redesign's category triple (`KIND` in the sdk's brand.ts): 3 is the bar, 6 the
 * shadow, 7 the date column (all of them at least 5:1 under white text; checked). */
const cosmicKind = (
  c: (typeof SDK_KIND)[keyof typeof SDK_KIND],
): KindTheme => ({
  bar: c[3],
  shadow: c[6],
  fill: PALETTE.card,
  date: c[7],
  dateInk: "#ffffff",
});

/** The newsletter's kinds follow the redesign's six categories: Interest Meeting is `info`, Demo Night
 * `milestone` (see `categoryOf` in the platform's eventKind.ts). */
export const COSMIC_KINDS: Record<KindKey, KindTheme> = {
  build: cosmicKind(SDK_KIND.build),
  interest: cosmicKind(SDK_KIND.info),
  workshop: cosmicKind(SDK_KIND.workshop),
  demo: cosmicKind(SDK_KIND.milestone),
  social: cosmicKind(SDK_KIND.social),
  study: cosmicKind(SDK_KIND.study),
};

export const PAPER_KINDS: Record<KindKey, KindTheme> = {
  build: {
    bar: "#57caff",
    shadow: GDGC.ink,
    fill: GDGC.sky,
    date: "#57caff",
    dateInk: GDGC.ink,
  },
  interest: {
    bar: "#ffd427",
    shadow: GDGC.ink,
    fill: GDGC.butter,
    date: "#ffd427",
    dateInk: GDGC.ink,
  },
  workshop: {
    bar: "#5cdb6d",
    shadow: GDGC.ink,
    fill: GDGC.mint,
    date: "#5cdb6d",
    dateInk: GDGC.ink,
  },
  demo: {
    bar: "#57caff",
    shadow: GDGC.ink,
    fill: GDGC.sky,
    date: "#57caff",
    dateInk: GDGC.ink,
  },
  social: {
    bar: "#ff7daf",
    shadow: GDGC.ink,
    fill: GDGC.blush,
    date: "#ff7daf",
    dateInk: GDGC.ink,
  },
  study: {
    bar: "#9aa0a6",
    shadow: GDGC.ink,
    fill: GDGC.grey,
    date: "#9aa0a6",
    dateInk: GDGC.ink,
  },
};

/** Paper's extra neutrals and Google accents (the rest are `GDGC`). */
export const PAPER = {
  body: "#3c4043",
  grey: "#5f6368",
  rule: "#9aa0a6",
  green: "#188038",
  red: "#c5221f",
  amber: "#b06000",
  googleBlue: "#4285f4",
  googleRed: "#ea4335",
  googleYellow: "#fbbc04",
  googleGreen: "#34a853",
  ctaBorder: "#0e3f8a",
} as const;

/**
 * Paper's dark twin, per property, for the colors `GDGC_DARK` does not cover
 * (the web Outlooks force light text onto repainted surfaces, so every light
 * surface needs a dark replacement). Merged over `GDGC_DARK` by darkmode.ts.
 */
export const PAPER_DARK = {
  color: {
    [PAPER.body]: "#bdc1c6",
    [PAPER.grey]: "#9aa0a6",
    [PAPER.green]: "#81c995",
    [PAPER.red]: "#f28b82",
    [PAPER.amber]: "#fdd663",
  },
  background: {
    [GDGC.white]: "#202124",
    // dividers and outlines drawn as painted cells
    [GDGC.ink]: "#bdc1c6",
  },
  border: {},
} as const satisfies Record<string, Record<string, string>>;

/** Cosmic's one stripe fallback ground: what shows if the space strip is blocked. */
export const COSMIC_SKY = "#0a0718";

export interface Theme {
  name: ThemeName;
  /** Pixel frames (stepped corners, hard shadows) or flat bordered cards. */
  frame: "pixel" | "flat";
  fonts: (ctxFonts: FontStacks) => FontStacks;
  kinds: Record<KindKey, KindTheme>;
  ground: string;
  windowFill: string;
  windowLine: string;
  windowBw: number;
  windowDepth: number;
  /** Title bar and footer fill; `barTexture` adds the dot grid. */
  bar: string;
  barTexture: boolean;
  /** Painted divider color and thickness. */
  rule: string;
  ruleH: number;
  /** Quiet separators inside the tonight card's date line. */
  sep: string;
  cardFill: string;
  cardLine: string;
  /** A quiet button's outline: a step softer than `cardLine`. */
  quietLine: string;
  cardBw: number;
  cardDepth: number;
  /** Tonight card outline width. */
  tonightBw: number;
  tonightDepth: number;
  newHereFill: string;
  signoffFill: string;
  ink: string;
  /** Body copy. */
  mute: string;
  /** Quiet copy and the date column's caps. */
  dim: string;
  /** Tonight card title color (Cosmic adds a hard text shadow in the kind's dark). */
  title: string;
  titleShadow: boolean;
  accent: string;
  /** The word `changelog` in the title bar. */
  termAccent: string;
  version: string;
  link: string;
  newHereLabel: string;
  signoffLabel: string;
  arrows: [string, string, string];
  dots: [string, string, string];
  /** "pixel": stepped-circle PNGs (`dot-<hex>`), so every client, classic Outlook too, draws the same circle. */
  dotShape: "pixel" | "round";
  cta: { fill: string; border: string; text: string };
  terminal: string;
  signature: string;
  radius: { window: number; card: number; row: number };
}

export const THEMES: Record<ThemeName, Theme> = {
  cosmic: {
    name: "cosmic",
    frame: "pixel",
    fonts: (fonts) => fonts,
    kinds: COSMIC_KINDS,
    ground: PALETTE.bar,
    windowFill: PALETTE.bg,
    windowLine: PALETTE.border,
    windowBw: 2,
    windowDepth: 8,
    bar: PALETTE.bar,
    barTexture: true,
    rule: PALETTE.card2,
    ruleH: 2,
    sep: PALETTE.border,
    cardFill: PALETTE.card,
    cardLine: PALETTE.border,
    quietLine: "#2b2837",
    cardBw: 2,
    cardDepth: 5,
    tonightBw: 4.5,
    tonightDepth: 7,
    newHereFill: PALETTE.card,
    signoffFill: PALETTE.card,
    ink: PALETTE.ink,
    mute: PALETTE.mute,
    dim: PALETTE.dim,
    title: "#ffffff",
    titleShadow: true,
    accent: COSMIC_KINDS.workshop.bar,
    termAccent: COSMIC_KINDS.workshop.bar,
    version: UGA,
    link: COSMIC_KINDS.build.bar,
    newHereLabel: COSMIC_KINDS.study.bar,
    signoffLabel: COSMIC_KINDS.social.bar,
    arrows: [
      COSMIC_KINDS.build.bar,
      COSMIC_KINDS.workshop.bar,
      COSMIC_KINDS.social.bar,
    ],
    dots: [KIND.interest, KIND.build, KIND.study],
    dotShape: "pixel",
    cta: { fill: UGA, border: "#8a0a22", text: PALETTE.ink },
    terminal: "devdogs",
    signature: "— the DevDogs officers",
    radius: { window: 14, card: 14, row: 12 },
  },
  paper: {
    name: "paper",
    frame: "flat",
    fonts: () => PAPER_FONTS,
    kinds: PAPER_KINDS,
    ground: GDGC.sky,
    windowFill: GDGC.white,
    windowLine: GDGC.ink,
    windowBw: 3,
    windowDepth: 0,
    bar: GDGC.white,
    barTexture: false,
    rule: GDGC.ink,
    ruleH: 2,
    sep: PAPER.rule,
    cardFill: GDGC.white,
    cardLine: GDGC.ink,
    quietLine: PAPER.rule,
    cardBw: 2,
    cardDepth: 0,
    tonightBw: 3,
    tonightDepth: 0,
    newHereFill: GDGC.butter,
    signoffFill: GDGC.blush,
    ink: GDGC.ink,
    mute: PAPER.body,
    dim: PAPER.grey,
    title: GDGC.ink,
    titleShadow: false,
    accent: PAPER.green,
    termAccent: GDGC.blue,
    version: PAPER.red,
    link: GDGC.blue,
    newHereLabel: PAPER.amber,
    signoffLabel: PAPER.red,
    arrows: [PAPER.googleBlue, PAPER.googleGreen, PAPER.googleRed],
    dots: [PAPER.googleRed, PAPER.googleYellow, PAPER.googleGreen],
    dotShape: "round",
    cta: { fill: GDGC.blue, border: PAPER.ctaBorder, text: GDGC.white },
    terminal: "gdgc",
    signature: "— the GDG on Campus UGA organizers",
    radius: { window: 20, card: 16, row: 14 },
  },
};

/** Google Sans for text, Google Sans Mono for the terminal voice; hosted next to the GDGC newsletter's fonts. */
export const PAPER_FONTS: FontStacks = {
  display: GDGC_FONT_STACK,
  sans: GDGC_FONT_STACK,
  mono: `'Google Sans Mono', 'Google Sans', ${EMAIL_FONTS.mono}`,
};

export function themeOf(issue: { theme?: ThemeName }): Theme {
  return THEMES[issue.theme ?? "cosmic"];
}

/** Hosted theme images: `<base>/<name>.png`, `base` decided by the render target. */
export const THEME_IMAGE_BASE = "https://devdogsuga.org/brand/newsletter/theme";

export type ThemeImage =
  | "cosmic-strip"
  | "cosmic-stairs"
  | "paper-asterisk"
  | "paper-devdogs-logo"
  | "paper-devdogs-logo-dark"
  | "paper-gdgc-lockup"
  | "paper-gdgc-lockup-dark"
  | `glow-${KindKey}`
  | `sprite-${string}`
  | `emoji-${string}`
  | `dot-${string}`
  | `arrow-${string}`;

/**
 * Colors each theme paints beyond the shared Changelog set, which the pin
 * lists in darkmode.ts must cover. Split per theme so a send only carries the
 * pins it uses (Gmail clips a message's HTML at ~102KB).
 */
export const THEME_PAINT = {
  cosmic: {
    background: [
      COSMIC_SKY,
      THEMES.cosmic.rule,
      THEMES.cosmic.cta.border,
      ...Object.values(COSMIC_KINDS).flatMap((k) => [k.bar, k.date]),
    ],
    text: [...Object.values(COSMIC_KINDS).map((k) => k.bar), "#ffffff"],
    border: [
      THEMES.cosmic.cta.border,
      THEMES.cosmic.cardLine,
      THEMES.cosmic.quietLine,
      ...Object.values(COSMIC_KINDS).map((k) => k.date),
    ],
  },
  paper: {
    background: [
      ...Object.values(PAPER_KINDS).flatMap((k) => [k.bar, k.fill]),
      PAPER.googleBlue,
      PAPER.googleRed,
      PAPER.googleYellow,
      PAPER.googleGreen,
      GDGC.white,
      GDGC.ink,
      GDGC.blue,
      PAPER.rule,
      PAPER.ctaBorder,
    ],
    text: [...Object.values(PAPER), GDGC.blue, GDGC.ink],
    border: [GDGC.ink, PAPER.ctaBorder, PAPER.rule],
  },
} as const;

/** The kinds that have a glow image, for the stylesheet. */
export const KIND_KEYS_FOR_CSS: KindKey[] = [
  "build",
  "interest",
  "workshop",
  "demo",
  "social",
  "study",
];
