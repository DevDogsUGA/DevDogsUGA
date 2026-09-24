import * as React from "react";
import type { ReactNode } from "react";
import { CARD_REFERENCE_WIDTH, cardLayout, OG_SIZE } from "../formats.js";
import {
  ACCENT,
  CONTACT,
  MARK,
  MAUVE,
  THEME,
  WORDMARK_ON_DARK,
} from "@devdogsuga/brand";
import { GdgcCobrand, Icon, Mark, Wordmark } from "../primitives.js";
import { rgba } from "./wash.js";

export { OG_SIZE };

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
  /** Tints the chip and the rule above the footer. */
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
  layout: "wide" | "square" | "standard";
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

export function cardContext(width: number, height: number): CardContext {
  const layout = cardLayout(width, height);
  const u = width / CARD_REFERENCE_WIDTH[layout];
  const horizontalPad =
    (layout === "square" ? SQUARE_HORIZONTAL_PADDING : 64) * u;

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
  accent = ACCENT.cyan400,
  footer,
  cobrand = true,
  children,
}: CardShellProps) {
  const { layout, u } = cardContext(width, height);

  const horizontalPad =
    (layout === "square" ? SQUARE_HORIZONTAL_PADDING : 64) * u;
  const verticalPad = (layout === "square" ? SQUARE_VERTICAL_PADDING : 64) * u;
  const wide = layout === "wide";
  const square = layout === "square";
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
    <GdgcCobrand height={(wide ? 62 : layout === "square" ? 54 : 44) * u} />
  ) : null;

  const chip = eyebrow ? (
    <div
      style={{
        display: "flex",
        fontFamily: "Hanken Grotesk",
        fontWeight: 700,
        fontSize: 24 * u,
        letterSpacing: 1.6 * u,
        color: THEME.ink,
        background: accent,
        padding: `${10 * u}px ${22 * u}px`,
        borderRadius: 999,
        // The wide layout puts this in a fixed-width column, where a flex
        // child stretches to the full 620px by default and the chip becomes a
        // bar. It is a pill in every layout or it is not the same card.
        alignSelf: square ? "center" : "flex-start",
      }}
    >
      {eyebrow.toUpperCase()}
    </div>
  ) : null;

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
          borderRadius: 3 * u,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 * u }}>
        <Icon name="Globe" size={26 * u} color={MAUVE[400]} />
        <div
          style={{
            fontFamily: "Hanken Grotesk",
            fontSize: 26 * u,
            color: MAUVE[400],
            textAlign: square ? "center" : "left",
          }}
        >
          {footer ?? CONTACT.site}
        </div>
      </div>
    </div>
  );

  const frame = {
    display: "flex",
    width,
    height,
    background: THEME.background,
    // The section's own colour behind the chip, so a wall of these is
    // distinguishable before any of the words resolve. On the root's own
    // `backgroundImage` rather than a stacked layer: Satori resolves
    // `position: absolute` against the flex content box, so a full-bleed layer
    // written as `left: 0, top: 0` lands at the top-left of the CONTENT and
    // paints a hard-edged rectangle across the image.
    backgroundImage: `radial-gradient(circle at ${wide ? "94%" : "88%"} 6%, ${rgba(accent, 0.16)}, ${rgba(accent, 0)} 45%)`,
    padding: `${verticalPad}px ${horizontalPad}px`,
  } as const;

  if (wide) {
    return (
      <div style={{ ...frame, alignItems: "center", gap: 72 * u }}>
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
