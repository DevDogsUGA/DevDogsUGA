import * as React from "react";
import type { ReactNode } from "react";
import {
  CARD_REFERENCE_WIDTH,
  cardLayout,
  OG_SIZE,
  type CardLayout,
} from "../formats.js";
import { CONTACT, MARK, WORDMARK_ON_DARK } from "../tokens.js";
import { COSMIC, DEVDOGS, KIND } from "../brand.js";
import { GdgcCobrand, Icon, Mark, Wordmark } from "../primitives.js";
import { rgba } from "./wash.js";

export { OG_SIZE };

/** The hue a card is drawn in: a category, or DevDogs red (the brand pair, never a category). */
export type CardHue = keyof typeof KIND | "devdogs";

/** A hue's light (3) and shadow (6) steps, as `data-kind` sets `--k3` and `--k6`. */
export function hueSteps(hue: CardHue): { light: string; deep: string } {
  const steps = hue === "devdogs" ? DEVDOGS : KIND[hue];
  return { light: steps[3], deep: steps[6] };
}

/**
 * Finds the shadow step for a light step, so a caller that only has the hex
 * (the CLI hands in an app's ground colour) still gets a matching title
 * shadow. An unknown colour is its own shadow.
 */
export function deepOf(light: string): string {
  for (const steps of [DEVDOGS, ...Object.values(KIND)]) {
    if (steps[3] === light) return steps[6];
  }
  return light;
}

/** The title treatment: white with a hard offset shadow in the hue's 600. */
export function titleShadow(deep: string, u: number): string {
  return `${5 * u}px ${5 * u}px 0 ${deep}`;
}

/**
 * A rectangle with the kit's one-cell stepped corners: a full-height middle
 * with two slivers inset by one cell either side. Needs no known width, so a
 * chip fits its label. Satori has no `clip-path` to cut corners with.
 */
export function Stepped({
  color,
  step,
  children,
  style,
}: {
  color: string;
  step: number;
  children?: ReactNode;
  style?: React.CSSProperties;
}) {
  const sliver = {
    display: "flex",
    width: step,
    alignSelf: "stretch",
    background: color,
    marginTop: step,
    marginBottom: step,
  } as const;

  return (
    <div style={{ display: "flex", ...style }}>
      <div style={sliver} />
      <div style={{ display: "flex", background: color }}>{children}</div>
      <div style={sliver} />
    </div>
  );
}

/**
 * The starfield behind every card: a few ink-pixel stars as stacked
 * single-colour gradients, which Satori paints as crisp squares.
 */
const STARS: readonly [number, number, number, string][] = [
  [0.04, 0.12, 4, "#ffffff"],
  [0.13, 0.93, 3, COSMIC["text-3"]],
  [0.19, 0.3, 3, COSMIC["text-3"]],
  [0.27, 0.9, 4, "#ffffff"],
  [0.36, 0.08, 3, COSMIC["text-3"]],
  [0.48, 0.2, 4, "#ffffff"],
  [0.55, 0.92, 3, COSMIC["text-3"]],
  [0.63, 0.1, 3, COSMIC["text-3"]],
  [0.72, 0.84, 4, "#ffffff"],
  [0.81, 0.26, 3, COSMIC["text-3"]],
  [0.9, 0.7, 4, "#ffffff"],
  [0.96, 0.4, 3, COSMIC["text-3"]],
];

function Starfield({
  width,
  height,
  u,
  inset,
}: {
  width: number;
  height: number;
  u: number;
  /** The root's padding: Satori places absolute children inside it. */
  inset: { x: number; y: number };
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: -inset.x,
        top: -inset.y,
        width,
        height,
      }}
    >
      {STARS.map(([x, y, size, color]) => {
        const px = Math.max(2, Math.round(size * u));
        return (
          <div
            key={`${x}-${y}`}
            style={{
              display: "flex",
              position: "absolute",
              left: Math.round(x * width),
              top: Math.round(y * height),
              width: px,
              height: px,
              background: color,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * The frame every card shares: club lockup, a section chip, the page's own
 * content, and the club's address along the bottom.
 *
 * Link previews and event banners are read in a scroll, at a size where the
 * picture registers before any of the words do. So the parts that say "this is
 * DevDogs" are fixed and identical on every card, and only the middle changes.
 *
 * ## Three layouts, not one that stretches
 *
 * The same card is asked for at 1.91:1 (a link unfurl), 3.94:1 (the GDG
 * platform's banner) and 1:1 (its square). Those are not one picture at three
 * sizes — 2560x650 has a column of horizontal room and almost no height, and
 * 1080x1080 the reverse. Stretching one layout across them puts a two-line
 * title through a 650px-tall frame with no room for the detail underneath.
 *
 * So `wide` turns the card on its side: the lockup and the chip take a left
 * column, the content takes the rest. `square` and `standard` stack, with
 * square given the larger type its extra height affords. Everything scales off
 * `u`, so a size is written once and holds at every canvas.
 */

export interface CardShellProps {
  width: number;
  height: number;
  /** The section this belongs to, in the chip. Absent leaves it off. */
  eyebrow?: string;
  /** Tints the chip and the rule above the footer (a hue's light step). */
  accent?: string;
  /** Replaces `devdogsuga.org` in the footer for a page worth deep-linking. */
  footer?: string;
  cobrand?: boolean;
  children: ReactNode;
}

/**
 * What a card's content needs to know about the frame it is drawn in.
 *
 * Handed to the caller by {@link cardContext} rather than to a render-prop
 * child. Satori walks `props.children` as a node tree without calling
 * anything, so a function child is read as an element and dies on
 * `props.children` of a function — the content has to be finished before it is
 * handed over.
 */
export interface CardContext {
  layout: CardLayout;
  /** Multiply every hard-coded size by this. 1 at the 1200x630 reference. */
  u: number;
  /** How much room the content actually has, in layout pixels. */
  contentWidth: number;
}

/**
 * The frame's measurements, for a caller that has to size type against them.
 *
 * Pure and cheap, so `CardShell` calls it too rather than threading the values
 * out of itself.
 */
/** The wide layout's fixed left column, holding the lockup, chip and address. */
const RAIL_WIDTH = 560;

/**
 * GDGC square artwork uses a centered 760px-wide safe column. Its 160px outer
 * margin plus 32px of breathing room keeps event details away from both edges.
 * Height is intentionally unrestricted beyond the normal card padding.
 */
const SQUARE_HORIZONTAL_PADDING = 192;
const SQUARE_VERTICAL_PADDING = 64;

/**
 * Instagram's tall formats. The feed crops nothing from a post, so it only
 * needs a comfortable margin; a story has the app's own chrome over its top
 * (profile row) and bottom (reply bar), so the lockup and the address must
 * clear them. 250px and 340px are the commonly published safe margins on a
 * 1920px story, rounded down a little since the content is centred anyway.
 */
const TALL_HORIZONTAL_PADDING = 88;

function tallPadding(height: number): { top: number; bottom: number } {
  return height >= 1800 ? { top: 220, bottom: 280 } : { top: 88, bottom: 88 };
}

function horizontalPadding(layout: CardLayout, u: number): number {
  if (layout === "square") return SQUARE_HORIZONTAL_PADDING * u;
  if (layout === "tall") return TALL_HORIZONTAL_PADDING * u;
  return 64 * u;
}

export function cardContext(width: number, height: number): CardContext {
  const layout = cardLayout(width, height);
  const u = width / CARD_REFERENCE_WIDTH[layout];
  const horizontalPad = horizontalPadding(layout, u);

  // The wide card's left column is fixed so the content column is predictable;
  // a column sized by its contents would move every time the club's address
  // changed length.
  const railWidth = RAIL_WIDTH * u;
  const contentWidth =
    layout === "wide"
      ? width - horizontalPad * 2 - railWidth - 72 * u
      : width - horizontalPad * 2;

  return { layout, u, contentWidth };
}

export function CardShell({
  width,
  height,
  eyebrow,
  accent = DEVDOGS[3],
  footer,
  cobrand = true,
  children,
}: CardShellProps) {
  const { layout, u } = cardContext(width, height);

  const horizontalPad = horizontalPadding(layout, u);
  const tallPad = tallPadding(height);
  const topPad =
    layout === "tall"
      ? tallPad.top * u
      : (layout === "square" ? SQUARE_VERTICAL_PADDING : 64) * u;
  const bottomPad = layout === "tall" ? tallPad.bottom * u : topPad;
  const verticalPad = topPad;
  const wide = layout === "wide";
  // The tall formats stack and centre exactly as the square does, with more
  // height to spend: they differ in padding and in the content's type sizes.
  const square = layout === "square" || layout === "tall";
  const railWidth = RAIL_WIDTH * u;

  const lockup = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: (wide ? 34 : 21) * u,
      }}
    >
      <Mark asset={MARK} height={(wide ? 96 : 60) * u} />
      <Wordmark asset={WORDMARK_ON_DARK} capHeight={(wide ? 62 : 39) * u} />
    </div>
  );

  const gdg = cobrand ? (
    <GdgcCobrand height={(wide ? 62 : square ? 54 : 44) * u} />
  ) : null;

  const chip = eyebrow ? (
    <Stepped
      color={accent}
      step={Math.max(2, 4 * u)}
      style={{ alignSelf: square ? "center" : "flex-start" }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: "Hanken Grotesk",
          fontWeight: 700,
          fontSize: 24 * u,
          letterSpacing: 1.6 * u,
          color: COSMIC["on-accent"],
          padding: `${9 * u}px ${20 * u}px`,
        }}
      >
        {eyebrow.toUpperCase()}
      </div>
    </Stepped>
  ) : null;

  const footerText = footer ?? CONTACT.site;
  // The address line's width, less the globe icon and its gap.
  const footerRoom =
    (wide ? RAIL_WIDTH * u : width - horizontalPad * 2) - 36 * u;

  const address = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: square ? "center" : "flex-start",
        gap: 18 * u,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 120 * u,
          height: 6 * u,
          background: accent,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 * u }}>
        <Icon name="Globe" size={26 * u} color={COSMIC["text-3"]} />
        <div
          style={{
            fontFamily: "Hanken Grotesk",
            // A long event path would wrap in the wide card's rail and push
            // the rule up into the chip; shrink it to fit on one line instead
            // (Hanken Grotesk averages about 0.52em a character).
            fontSize: Math.min(26 * u, footerRoom / (footerText.length * 0.52)),
            whiteSpace: "nowrap",
            color: COSMIC["text-3"],
            textAlign: square ? "center" : "left",
          }}
        >
          {footerText}
        </div>
      </div>
    </div>
  );

  const stars = (
    <Starfield
      width={width}
      height={height}
      u={u}
      inset={{ x: horizontalPad, y: verticalPad }}
    />
  );

  const frame = {
    display: "flex",
    width,
    height,
    background: COSMIC.bg,
    // The section's own colour behind the chip, so a wall of these is
    // distinguishable before any of the words resolve. On the root's own
    // `backgroundImage` rather than a stacked layer: Satori resolves
    // `position: absolute` against the flex content box, so a full-bleed layer
    // written as `left: 0, top: 0` lands at the top-left of the CONTENT and
    // paints a hard-edged rectangle across the image.
    backgroundImage: `radial-gradient(circle at ${wide ? "94%" : "88%"} 6%, ${rgba(accent, 0.18)}, ${rgba(accent, 0)} 45%)`,
    padding: `${topPad}px ${horizontalPad}px ${bottomPad}px`,
  } as const;

  if (wide) {
    return (
      <div style={{ ...frame, alignItems: "center", gap: 72 * u }}>
        {stars}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: railWidth,
            flexShrink: 0,
            justifyContent: "space-between",
            height: "100%",
          }}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: 28 * u }}
          >
            {lockup}
            {chip}
          </div>
          {address}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            height: "100%",
            minHeight: 0,
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: height - verticalPad * 2 - 76 * u,
              overflow: "hidden",
              justifyContent: "center",
            }}
          >
            {children}
          </div>
          <div
            style={{ display: "flex", alignSelf: "flex-end", flexShrink: 0 }}
          >
            {gdg}
          </div>
        </div>
      </div>
    );
  }

  if (square) {
    return (
      <div
        style={{
          ...frame,
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {stars}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22 * u,
            flexShrink: 0,
          }}
        >
          {lockup}
          {chip}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            flexGrow: 1,
            minHeight: 0,
            overflow: "hidden",
            justifyContent: "center",
          }}
        >
          {children}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18 * u,
            flexShrink: 0,
          }}
        >
          {gdg}
          {address}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...frame,
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {stars}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        {lockup}
        {chip}
      </div>
      {/*
        `overflow: hidden` is a guard, not a layout. The lockup and the address
        are fixed; the middle is whatever a meeting title and agenda turn out to
        be. Without the clamp one long night pushes the address off the bottom —
        and a card fails silently, on somebody else's server, weeks later.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
          overflow: "hidden",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        {address}
        {gdg}
      </div>
    </div>
  );
}
