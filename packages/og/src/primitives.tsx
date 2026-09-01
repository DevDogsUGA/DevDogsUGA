import type { ReactElement } from "react";
import { ICON_PATHS, type IconName } from "./generated/icons.js";
import { type Asset } from "./generated/assets.js";
import { THEME, WORDMARK_METRICS } from "./brand.js";

/**
 * Satori is not a browser, and three of its limits shape everything below.
 *
 * A `div` holding more than one child must say `display: flex` — Satori has no
 * block layout and silently stacks children on top of each other otherwise.
 * Text needs a `fontFamily` that matches a registered face by name and an
 * exactly-registered weight, because there is no font synthesis and no
 * fallback chain. And `img` needs both dimensions up front, since nothing here
 * can wait for an image to load and measure itself.
 *
 * The helpers in this file exist so no template has to remember that.
 */

/** A Phosphor mark, tinted. Drawn inline so `color` is the caller's to pick. */
export function Icon({
  name,
  size,
  color,
}: {
  name: IconName;
  size: number;
  color: string;
}): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill={color}>
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** A brand mark at a given height, its width following the artwork's ratio. */
export function Mark({ asset, height }: { asset: Asset; height: number }) {
  return (
    <img
      src={asset.src}
      width={Math.round((asset.width / asset.height) * height)}
      height={Math.round(height)}
    />
  );
}

/**
 * The wordmark, sized by cap height rather than by its box.
 *
 * Every lockup here sets the wordmark against something else — the GDGC
 * chapter mark, a line of Hanken Grotesk — and type reads as "the same size"
 * when its capitals match, not when its bounding boxes do. Asking for cap
 * height and converting is what keeps `<Wordmark capHeight={78}/>` and
 * `fontSize: 78` looking like siblings.
 */
export function Wordmark({
  asset,
  capHeight,
}: {
  asset: Asset;
  capHeight: number;
}) {
  return (
    <Mark asset={asset} height={capHeight / WORDMARK_METRICS.capHeightRatio} />
  );
}

/**
 * A neobrutalist tile: saturated fill, hard border, hard offset shadow.
 *
 * The shadow is a `box-shadow` with zero blur rather than a second offset
 * element, which Satori renders as a crisp filter with `stdDeviation="0"`. The
 * caller owns the outer margin: a shadow is drawn outside the border box and
 * will be clipped by the image edge if nothing leaves room for it.
 */
export function Tile({
  size,
  fill,
  radius,
  border,
  shadow,
  children,
}: {
  size: number;
  fill: string;
  radius: number;
  border: number;
  shadow: number;
  children?: ReactElement;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        background: fill,
        border: `${border}px solid ${THEME.ink}`,
        borderRadius: radius,
        boxShadow: `${shadow}px ${shadow}px 0 0 ${THEME.ink}`,
      }}
    >
      {children}
    </div>
  );
}

/** An icon and its label on one line, at a shared optical size. */
export function IconRow({
  name,
  label,
  size,
  iconColor,
  textColor,
  weight = 400,
}: {
  name: IconName;
  label: string;
  size: number;
  iconColor: string;
  textColor: string;
  weight?: 400 | 700;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.42 }}>
      {/* Marginally larger than the cap height beside it: a 256-unit Phosphor
          glyph carries padding inside its box that type does not. */}
      <Icon name={name} size={size * 1.18} color={iconColor} />
      <div
        style={{
          fontFamily: "Hanken Grotesk",
          fontWeight: weight,
          fontSize: size,
          color: textColor,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * The three social marks, then the one handle they share.
 *
 * `@devdogsuga` is the same on Instagram, LinkedIn and GitHub (see
 * `config/nav.ts`), so repeating it under each mark would be three copies of
 * one fact. The marks gather, the handle is said once.
 */
export function SocialRow({
  size,
  iconColor,
  textColor,
  handle,
}: {
  size: number;
  iconColor: string;
  textColor: string;
  handle: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.42 }}>
      <div style={{ display: "flex", alignItems: "center", gap: size * 0.22 }}>
        <Icon name="InstagramLogo" size={size * 1.18} color={iconColor} />
        <Icon name="LinkedinLogo" size={size * 1.18} color={iconColor} />
        <Icon name="GithubLogo" size={size * 1.18} color={iconColor} />
      </div>
      <div
        style={{
          fontFamily: "Hanken Grotesk",
          fontSize: size,
          color: textColor,
        }}
      >
        {handle}
      </div>
    </div>
  );
}
