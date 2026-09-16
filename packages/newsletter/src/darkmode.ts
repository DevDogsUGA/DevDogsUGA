/**
 * Background painting and dark-mode color pinning.
 *
 * The newsletter is dark-native, but dark-mode mail clients do not leave
 * "already dark" alone: Outlook.com, new Outlook and Outlook mobile run every
 * color through a contrast-repair pass, and classic Outlook's Word engine
 * does a full invert. Forensics on a received copy (2026-09-11) showed
 * exactly how the web Outlooks repaint: every INLINE background gets its
 * repaired value rewritten in place with `!important` — which by CSS rules no
 * stylesheet rule can ever outrank — while colors that live only in the
 * embedded stylesheet arrive untouched, and rewritten `bgcolor` attributes
 * stay presentational hints that any stylesheet rule beats.
 *
 * That asymmetry dictates the architecture: backgrounds are never painted
 * inline. Every painted element carries a `bc-` class, `paintCss()` supplies
 * the base rule (color plus the same-color gradient underlay of `solidBg`),
 * a `bgcolor` attribute covers clients without `<style>`, and `darkModeCss()`
 * re-asserts each color with `!important` for the clients that recolor
 * stylesheets. The web Outlooks leave one hook for those pins: each element
 * they recolor gains a `data-ogsc` (original color) or `data-ogsb` (original
 * background) attribute, rules scoped under those attributes escape their
 * conversion, and `<body>` keeps the one deliberate inline background as the
 * sacrificial donor that guarantees a `data-ogsb` above everything. Text
 * colors stay inline — Outlook's text repairs (lightening the dim tones)
 * read fine on the pinned surfaces. Borders split by role: Outlook repaints
 * border colors inline with `!important` too, so structural dividers are
 * painted 1px cells (full background armor) and only the card outlines
 * remain true borders, where the repaint reads as an intentional outline.
 * Classic
 * Outlook has no hook; its invert cannot be prevented, only tolerated (it
 * guarantees its own text contrast, and the reading pane offers a per-message
 * toggle back to the sent colors).
 *
 * Every element that paints a color therefore carries a utility class naming
 * the hex it paints (`tc-`/`bc-`/`brc-` for text, background, border), and
 * this module generates every rule from the same theme tokens the components
 * render with. `render.test.tsx` walks the rendered document and fails on any
 * inline background or any color that lacks its class, so the halves cannot
 * drift.
 */
import type { CSSProperties } from "react";
import {
  chipColors,
  dotGrid,
  HEADING_TINTS,
  KIND,
  PALETTE,
  slants,
  solidBg,
  UGA,
} from "./theme.js";

/** Class for an element whose `color` is `color`. */
export function tc(color: string): string {
  return `tc-${color.slice(1)}`;
}

/** Class for an element whose background is `color`. */
export function bc(color: string): string {
  return `bc-${color.slice(1)}`;
}

/** Class for an element with a `color`-colored border. */
export function brc(color: string): string {
  return `brc-${color.slice(1)}`;
}

const KINDS = Object.values(KIND);
const CHIPS = KINDS.flatMap((kind) =>
  [PALETTE.card, PALETTE.card2].map((ground) => chipColors(kind, ground)),
);

/** Every background the components paint — the classes `paintCss` must feed. */
const BACKGROUNDS = [
  PALETTE.bg,
  PALETTE.bar,
  PALETTE.card,
  PALETTE.card2,
  // The divider color: structural dividers are painted 1px cells, not
  // borders, because the web Outlooks' dark mode repaints border colors
  // inline with !important and borders have no box-shadow armor.
  PALETTE.border,
  UGA,
  ...KINDS,
  ...CHIPS.map((chip) => chip.fill),
];

const PINS: {
  classFor: (color: string) => string;
  property: string;
  colors: string[];
}[] = [
  {
    classFor: tc,
    property: "color",
    colors: [
      PALETTE.ink,
      PALETTE.mute,
      PALETTE.dim,
      UGA,
      ...KINDS,
      ...CHIPS.map((chip) => chip.text),
      ...Object.values(HEADING_TINTS),
    ],
  },
  {
    classFor: bc,
    property: "background-color",
    colors: BACKGROUNDS,
  },
  {
    classFor: brc,
    property: "border-color",
    colors: [
      PALETTE.border,
      UGA,
      ...KINDS,
      ...CHIPS.map((chip) => chip.border),
    ],
  },
];

/** The slant stripe's texture class — always the UGA red. */
export const SLANTS_CLASS = "bg-slants";

/** The terminal bars' faint dot-grid texture class. */
export const DOT_GRID_CLASS = "bg-dots";

/** One camelCased style object as a CSS declaration block. */
function declarations(style: CSSProperties): string {
  return Object.entries(style)
    .map(
      ([property, value]) =>
        `${property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${String(value)}`,
    )
    .join(";");
}

/**
 * The base paint layer: what actually colors every `bc-` background, since no
 * background is ever inline (see the module comment). Deliberately without
 * `!important` so the pins in `darkModeCss()` outrank it, and with the
 * texture rules last so their `background-image` wins the tie against the
 * flat `bc-` rule on the same element. The platform's /changelog pages embed
 * this too — the classes paint there exactly as they do in an inbox.
 */
export function paintCss(): string {
  return [
    ...[...new Set(BACKGROUNDS)].map(
      (color) => `.${bc(color)}{${declarations(solidBg(color))}}`,
    ),
    `.${SLANTS_CLASS}{${declarations(slants(UGA))}}`,
    `.${DOT_GRID_CLASS}{${declarations(dotGrid(PALETTE.bar, "rgba(255,255,255,.05)"))}}`,
  ].join("\n");
}

/**
 * `shadowArmor` adds the one declaration Outlook's dark transform provably
 * does not process (carrier probe, 2026-09-11): a huge same-color inset
 * `box-shadow`, painting the authored color OVER the `background-color`
 * Outlook injects inline with `!important`. The spread must reach the middle
 * of the tallest element that wears a `bc-` class — the 600px canvas table —
 * from every edge, hence 3000px. Armor belongs only in the `data-og*` scoped
 * layers: those apply exactly when Outlook has stamped the DOM, so no other
 * client ever renders the shadow (an inset shadow paints over
 * `background-image`, and would otherwise erase the dot-grid and slant
 * textures everywhere they work).
 */
function rules(
  scope: (selector: string) => string,
  shadowArmor = false,
): string {
  return PINS.flatMap(({ classFor, property, colors }) =>
    [...new Set(colors)].map((color) => {
      const selector = `.${classFor(color)}`;
      const armor =
        shadowArmor && property === "background-color"
          ? `;box-shadow:inset 0 0 0 3000px ${color} !important`
          : "";
      return `${scope(selector)}{${property}:${color} !important${armor}}`;
    }),
  ).join("\n");
}

/**
 * The pinning stylesheet `ChangelogDocument` embeds. Three layers, weakest
 * first: a `color-scheme` declaration telling well-behaved clients the email
 * handles both schemes itself, the same pins under `prefers-color-scheme` for
 * clients that honor the media query (Apple Mail, Outlook for Mac), and the
 * `data-ogsc`/`data-ogsb` scoped pins for the web Outlooks, which apply their
 * recoloring in the DOM rather than through any media query.
 *
 * The scoped layers are where the real fight happens. The 2026 web Outlooks
 * compute every element's effective background from the full cascade and
 * inject the repaired value inline with `!important` — unbeatable by any
 * stylesheet color — so the scoped pins carry the box-shadow armor (see
 * `rules`) that repaints the authored color on top. The color pins still
 * matter for Outlook mobile's older transform, and the `<body>` donor in
 * `ChangelogDocument` guarantees a stamped ancestor so the scope always
 * matches in dark mode.
 *
 * The scoped rules are deliberately spartan: Outlook.com's CSS support only
 * stretches to an attribute selector on an ancestor (`[data-ogsc] .x`), not
 * compounded onto the element itself (`.x[data-ogsc]`), and a selector its
 * sanitizer rejects can take the whole rule down with it — so every pin is
 * its own single-selector rule, in the one shape the client is documented
 * to keep. Both attributes scope every rule because which one Outlook stamps
 * depends on whether it rewrote a color or a background up the tree.
 */
export function darkModeCss(): string {
  return [
    ":root{color-scheme:light dark;supported-color-schemes:light dark}",
    `@media (prefers-color-scheme: dark){\n${rules((selector) => selector)}\n}`,
    rules((selector) => `[data-ogsc] ${selector}`, true),
    rules((selector) => `[data-ogsb] ${selector}`, true),
  ].join("\n");
}
