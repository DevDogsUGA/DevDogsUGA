import { timeRange } from "./date-format.js";
import { CHANGELOG_FONT_CSS } from "./changelog-fonts.js";
import { CampaignEmail } from "./campaign.js";
import { CAMPAIGN_FONT_CSS } from "./campaign-fonts.js";
/**
 * The Changelog, as one component tree with two render targets.
 *
 * The platform mounts `<ChangelogEmail>` inside a server page; the export CLI
 * feeds `<ChangelogDocument>` to `renderToStaticMarkup` and mails the string.
 * Which is why everything here is written to the WORST renderer it will meet
 * — classic Outlook's Word engine — and the page simply inherits the
 * conservatism: tables for layout, longhand font properties (never the `font:`
 * shorthand, which Word applies unreliably), and no alpha anywhere (see
 * `mix`).
 *
 * Backgrounds are never painted inline. The web Outlooks' dark mode rewrites
 * every inline background in place with inline `!important`, which nothing
 * can outrank — so each painted element carries a `bc-` class that
 * `paintCss()` colors from the stylesheet (where those clients leave colors
 * alone), doubled by a `bgcolor` attribute for clients without `<style>`.
 * Text and border colors stay inline with `tc-`/`brc-` classes alongside, so
 * the pinning rules in `darkModeCss()` can re-assert them where a client's
 * dark mode rewrites stylesheets instead. The platform's /changelog pages
 * embed `paintCss()` too; only `ChangelogDocument` adds the pins.
 *
 * Two design-system themes (`design.ts`) finish this one structure: Cosmic
 * (pixel art, rounded outlined cards with hard shadows) for DevDogs and Paper
 * (flat pastel, ink outlines, Google Sans) for GDGC. Corners and shadows are
 * inline enhancements over a square bgcolor-painted base, which is all
 * classic Outlook keeps.
 *
 * The two targets differ only through `RenderContext`: the page passes
 * `next/font` CSS variables and SVG image sources, the exporter passes literal
 * font stacks and `cid:` references to embedded PNGs (Gmail and Outlook strip
 * SVG, which is also why og ships its email signature as PNG).
 */
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { EVENT_TZ, meetingLocation } from "@devdogsuga/sdk/brand/event";
import type { Meeting } from "@devdogsuga/events";

import { MARK_SIZES, partnerLogoSize, type RenderContext } from "./assets.js";
import {
  bc,
  brc,
  darkModeCss,
  DARK_IMAGE_CLASS,
  DOT_GRID_CLASS,
  glowClass,
  LIGHT_IMAGE_CLASS,
  paintCss,
  tc,
} from "./darkmode.js";
import {
  COSMIC_SKY,
  eventArt,
  kindKey,
  PAPER,
  themeOf,
  type KindKey,
  type Theme,
  type ThemeImage,
} from "./design.js";
import type { ChangelogIssue, FeaturedEvent } from "./issues.js";
import { PARTNERS } from "./partners.js";
import {
  font,
  type FontStacks,
  KIND,
  PALETTE,
  SITE,
  SOCIAL_LINKS,
  solidBg,
  FONTS_HREF,
  UGA,
} from "./theme.js";

/**
 * React hyphenates unknown camelCase style keys, which is how the two
 * Outlook-only `mso-*` hints reach the wire; CSSProperties just has to be
 * taught they exist.
 */
type EmailCSSProperties = CSSProperties & {
  msoPaddingAlt?: string;
  msoLineHeightRule?: string;
  msoHide?: string;
};

const WIDTH = 600;

/**
 * Longhand text styling that leaves the family to inherit: the sans stack is
 * set once on each section's `<td>` (`sectionStyle`) instead of on every
 * line — the stack is ~200 bytes, and repeating it was most of the weight
 * Gmail counts toward its ~102KB clip.
 */
function ambient(
  weight: number,
  size: number,
  lineHeight: number | string,
): CSSProperties {
  return { fontWeight: weight, fontSize: `${size}px`, lineHeight };
}

/** Every layout table shares these; email clients honor the attributes where they ignore the CSS. */
const TABLE_RESET = {
  role: "presentation",
  cellPadding: 0,
  cellSpacing: 0,
  border: 0,
} as const;

/**
 * React 19's types dropped the legacy `bgcolor` from `<td>` (it survives on
 * `<table>`). Classic Outlook still reads the attribute where it ignores the
 * CSS, so it arrives through a spread the checker cannot veto; React renders
 * lowercase unknown attributes verbatim.
 */
function bgAttr(color: string): Record<string, string> {
  return { bgcolor: color };
}

/**
 * A divider as a painted cell, never a border: the web Outlooks' dark mode
 * repaints border colors inline with `!important` (turning dividers
 * near-white on the pinned dark surfaces), while a painted cell gets the
 * full background armor. Card outlines stay true borders in Paper — their
 * repaint reads as an intentional outline.
 */
function DividerCell({
  color,
  size = 1,
  vertical = false,
}: {
  color: string;
  size?: number;
  vertical?: boolean;
}) {
  const box = vertical ? { width: `${size}px` } : { height: `${size}px` };
  return (
    <td
      {...bgAttr(color)}
      {...(vertical ? { width: size } : { height: size })}
      className={bc(color)}
      style={{ ...box, fontSize: "0px", lineHeight: 0 }}
    >
      {" "}
    </td>
  );
}

/** A themed image: an `<img>` with its size declared so a blocked image keeps the layout. */
function ThemeImg({
  ctx,
  name,
  width,
  height,
  alt = "",
  style,
}: {
  ctx: RenderContext;
  name: ThemeImage;
  width: number;
  height: number;
  alt?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      src={ctx.assets.themeImage(name)}
      width={width}
      height={height}
      alt={alt}
      style={{ display: "block", border: 0, outline: "none", ...style }}
    />
  );
}

const PIXELATED: CSSProperties = { imageRendering: "pixelated" };

/** A light graphic and its dark twin; only the Outlook dark-mode stamps swap them (see `darkModeCss`). */
function ThemeImgPair({
  ctx,
  light,
  dark,
  width,
  height,
  alt,
}: {
  ctx: RenderContext;
  light: ThemeImage;
  dark: ThemeImage;
  width: number;
  height: number;
  alt: string;
}) {
  return (
    <>
      <img
        src={ctx.assets.themeImage(light)}
        width={width}
        height={height}
        alt={alt}
        className={LIGHT_IMAGE_CLASS}
        style={{ display: "block", border: 0 }}
      />
      <div
        className={DARK_IMAGE_CLASS}
        style={{ display: "none", msoHide: "all" } as EmailCSSProperties}
      >
        <img
          src={ctx.assets.themeImage(dark)}
          width={width}
          height={height}
          alt={alt}
          style={{ display: "block", border: 0 }}
        />
      </div>
    </>
  );
}

/**
 * One outlined card in the active theme.
 *
 * Pixel (Cosmic): a bgcolor outline cell around a bgcolor fill cell — a plain
 * outlined box in every client — rounded and given a hard inline shadow where
 * the client allows. Flat (Paper): a bordered cell with rounded corners where
 * `border-radius` works.
 */
function Frame({
  t,
  line,
  fill,
  bw,
  depth = 0,
  shadow = "#000000",
  radius = 0,
  fillClass = "",
  width,
  margin,
  children,
}: {
  t: Theme;
  line: string;
  fill: string;
  bw: number;
  depth?: number;
  shadow?: string;
  radius?: number;
  fillClass?: string;
  width?: number;
  margin?: string;
  children: ReactNode;
}) {
  const sized = width
    ? { width, style: { maxWidth: `${width}px`, width: "100%" } }
    : { width: "100%", style: {} };
  if (t.frame === "flat") {
    return (
      <table
        {...TABLE_RESET}
        width={sized.width}
        style={{ ...sized.style, borderCollapse: "separate", margin }}
      >
        <tbody>
          <tr>
            <td
              {...bgAttr(fill)}
              className={`${bc(fill)} ${brc(line)} ${fillClass}`}
              style={{
                border: `${bw}px solid ${line}`,
                borderRadius: `${radius}px`,
              }}
            >
              {children}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
  // Cosmic: a bgcolor outline cell around a bgcolor fill cell, rounded where
  // border-radius works (square in classic Outlook). The hard shadow is inline
  // so it survives clients that drop <style> blocks; classic Outlook has none.
  const inner = Math.max(radius - bw, 0);
  return (
    <table
      {...TABLE_RESET}
      width={sized.width}
      style={{
        ...sized.style,
        margin,
        borderCollapse: "separate",
        borderRadius: `${radius}px`,
        boxShadow: depth ? `${depth}px ${depth}px 0 0 ${shadow}` : undefined,
      }}
    >
      <tbody>
        <tr>
          <td
            {...bgAttr(line)}
            className={bc(line)}
            style={{ padding: `${bw}px`, borderRadius: `${radius}px` }}
          >
            <table
              {...TABLE_RESET}
              width="100%"
              style={{ borderCollapse: "separate" }}
            >
              <tbody>
                <tr>
                  <td
                    {...bgAttr(fill)}
                    className={`${bc(fill)} ${fillClass}`}
                    style={{ borderRadius: `${inner}px` }}
                  >
                    {children}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Three title-bar dots echoing terminal window controls: kind-colored pixel circles (Cosmic) or Google's red/yellow/green (Paper). */
function TitleDots({ t, ctx }: { t: Theme; ctx: RenderContext }) {
  if (t.dotShape === "pixel") {
    return (
      <table {...TABLE_RESET}>
        <tbody>
          <tr>
            {t.dots.map((color) => (
              <td key={color} style={{ paddingLeft: "6px" }}>
                <ThemeImg
                  ctx={ctx}
                  name={`dot-${color.slice(1).toLowerCase()}`}
                  width={12}
                  height={12}
                  style={PIXELATED}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    );
  }
  return (
    <span style={{ fontSize: "0px", lineHeight: 0 }}>
      {t.dots.map((color) => (
        <span
          key={color}
          className={`${bc(color)} ${brc(t.ink)}`}
          style={{
            display: "inline-block",
            borderRadius: "50%",
            marginLeft: "6px",
            border: `1.5px solid ${t.ink}`,
            width: "8px",
            height: "8px",
          }}
        />
      ))}
    </span>
  );
}

/**
 * Outlook's Word engine does not reliably apply padding, borders, or
 * backgrounds to anchors. All button geometry lives on a table cell; the
 * anchor is responsible only for the label.
 */
/**
 * Phosphor's ArrowRight (bold) after a button label, as a PNG in the label's
 * color (build-theme-assets.py): a glyph would fall back to whatever font the
 * client has. Paper's quiet buttons take its grey, which reads on the light
 * card and the dark twin alike.
 */
function ButtonArrow({
  ctx,
  color,
  size,
}: {
  ctx: RenderContext;
  color: string;
  size: number;
}) {
  const hex = (color === PAPER.body ? PAPER.grey : color)
    .slice(1)
    .toLowerCase();
  return (
    <img
      src={ctx.assets.themeImage(`arrow-${hex}`)}
      width={size}
      height={size}
      alt=""
      style={{ border: 0, verticalAlign: "-2px", marginLeft: "5px" }}
    />
  );
}

/**
 * An event's two buttons, the same size side by side: a quiet secondary on
 * the left (outlined, muted text) and a filled primary on the right. Drawn
 * like `CtaButton compact`, but as cells of one table rather than a table
 * each, since an issue lists one pair per event and Gmail clips a message's
 * HTML at ~102KB.
 */
function ButtonRow({
  ctx,
  secondary,
  primary,
  ground,
  quiet,
  loud,
}: {
  ctx: RenderContext;
  secondary: { label: string; url: string };
  primary: { label: string; url: string };
  ground: string;
  quiet: { line: string; text: string };
  loud: { fill: string; line: string; text: string };
}) {
  const cell = (
    b: { label: string; url: string },
    fill: string,
    line: string,
    text: string,
  ) => (
    <td
      width="48%"
      align="center"
      valign="middle"
      {...bgAttr(fill)}
      className={`${bc(fill)} ${brc(line)}`}
      style={
        {
          border: `1px solid ${line}`,
          borderRadius: "8px",
          padding: "9px 13px",
          msoPaddingAlt: "0",
        } as EmailCSSProperties
      }
    >
      <a
        href={b.url}
        className={tc(text)}
        style={
          {
            display: "block",
            ...ambient(700, 12, 1),
            color: text,
            textDecoration: "none",
            msoLineHeightRule: "exactly",
          } as EmailCSSProperties
        }
      >
        {b.label}
        <ButtonArrow ctx={ctx} color={text} size={12} />
      </a>
    </td>
  );
  return (
    <table {...TABLE_RESET} width="100%" style={{ borderCollapse: "separate" }}>
      <tbody>
        <tr>
          {cell(secondary, ground, quiet.line, quiet.text)}
          <td
            width={10}
            style={{
              width: "10px",
              minWidth: "10px",
              fontSize: "0px",
              lineHeight: 0,
            }}
          >
            &nbsp;
          </td>
          {cell(primary, loud.fill, loud.line, loud.text)}
        </tr>
      </tbody>
    </table>
  );
}

function CtaButton({
  ctx,
  label,
  url,
  color,
  textColor,
  ground,
  compact = false,
  align,
  borderColor = color,
}: {
  ctx: RenderContext;
  label: string;
  url: string;
  color: string;
  textColor: string;
  ground?: string;
  compact?: boolean;
  /** The table's `align` attribute, for clients that ignore the cell's. */
  align?: "left" | "right";
  borderColor?: string;
}) {
  const fill = ground ?? color;
  return (
    <table {...TABLE_RESET} align={align}>
      <tbody>
        <tr>
          <td
            align="center"
            valign="middle"
            {...bgAttr(fill)}
            className={`${bc(fill)} ${brc(borderColor)}`}
            style={
              {
                border: `1px solid ${borderColor}`,
                borderRadius: "8px",
                padding: compact ? "9px 13px" : "14px 26px",
                msoPaddingAlt: "0",
                whiteSpace: "nowrap",
              } as EmailCSSProperties
            }
          >
            <a
              href={url}
              className={tc(textColor)}
              style={
                {
                  display: "block",
                  ...ambient(compact ? 700 : 800, compact ? 12 : 15, 1),
                  color: textColor,
                  textDecoration: "none",
                  msoLineHeightRule: "exactly",
                } as EmailCSSProperties
              }
            >
              {label}
              <ButtonArrow
                ctx={ctx}
                color={textColor}
                size={compact ? 12 : 14}
              />
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function inEventZone(at: Date, options: Intl.DateTimeFormatOptions): string {
  return at.toLocaleString("en-US", { timeZone: EVENT_TZ, ...options });
}

/**
 * What a card prints for a meeting, in Eastern time. Its colours come from the
 * meeting's resolved category, unless the issue overrides them
 * (`FeaturedEvent.kind`).
 */
function eventCard(meeting: Meeting, kindOverride?: KindKey) {
  const startsAt = new Date(meeting.startsAt);
  const kind = kindOverride ?? kindKey(meeting.category);
  return {
    kind,
    color: KIND[kind],
    dow: inEventZone(startsAt, { weekday: "short" }).toUpperCase(),
    month: inEventZone(startsAt, { month: "short" }),
    day: inEventZone(startsAt, { day: "numeric" }),
    time: timeRange(startsAt, new Date(meeting.endsAt)),
    loc: meetingLocation(meeting.building, meeting.location) ?? "TBA",
  };
}

/** The event's sprite (Cosmic) or flat emoji (Paper) at `size` px, top right of its card: picked by what the night is (`eventArt`), falling back to its kind. */
function EventArt({
  t,
  ctx,
  meeting,
  kind,
  size,
}: {
  t: Theme;
  ctx: RenderContext;
  meeting: Meeting;
  kind: KindKey;
  size: number;
}) {
  const cosmic = t.name === "cosmic";
  return (
    <ThemeImg
      ctx={ctx}
      name={`${cosmic ? "sprite" : "emoji"}-${eventArt(meeting.kicker ? `${meeting.kicker} ${meeting.title}` : meeting.title, kind)}`}
      width={size}
      height={size}
      style={cosmic ? PIXELATED : undefined}
    />
  );
}

/**
 * An upcoming-event row, drawn the way the site's schedule list draws one: a
 * stacked weekday / day-number date column under a bar in the kind's color, a
 * chip pill, a display-face title, the time + room in quiet sans, and the
 * kind's sprite at the top right.
 */
function EventRow({
  meeting,
  ctx,
  t,
}: {
  meeting: Meeting;
  ctx: RenderContext;
  t: Theme;
}) {
  const fonts = t.fonts(ctx.fonts);
  const card = eventCard(meeting);
  const kt = t.kinds[card.kind];
  const radiusIn = Math.max(t.radius.row - t.cardBw, 0);
  const dateInk = kt.dateInk;
  const page = `${SITE}/events/${encodeURIComponent(meeting.slug)}`;
  // Exactly two: Details (quiet, left) and the one thing to do (filled, right):
  // RSVP where there is one, else Add to Calendar.
  const primary = meeting.rsvpUrl
    ? { label: "RSVP", url: meeting.rsvpUrl }
    : { label: "Add to Calendar", url: `${page}/calendar.ics` };
  return (
    <Frame
      t={t}
      line={t.cardLine}
      fill={t.cardFill}
      bw={t.cardBw}
      depth={t.cardDepth}
      radius={t.radius.row}
      margin={`0 0 ${t.frame === "pixel" ? 16 : 12}px`}
    >
      <table {...TABLE_RESET} width="100%">
        <tbody>
          <tr>
            {/* The date column is the kind's colour, top to bottom, with the weekday leading. */}
            <td
              width={72}
              align="center"
              valign="middle"
              {...bgAttr(kt.date)}
              className={bc(kt.date)}
              style={{
                padding: "14px 4px",
                fontFamily: fonts.display,
                borderRadius: `${radiusIn}px 0 0 ${radiusIn}px`,
              }}
            >
              <div
                className={tc(dateInk)}
                style={{
                  ...ambient(800, 15, 1),
                  letterSpacing: "1.5px",
                  color: dateInk,
                  textTransform: "uppercase",
                }}
              >
                {card.dow}
              </div>
              <div
                className={tc(dateInk)}
                style={{
                  ...ambient(800, 30, 1.1),
                  color: dateInk,
                  padding: "4px 0 3px",
                }}
              >
                {card.day}
              </div>
              <div
                className={tc(dateInk)}
                style={{
                  ...ambient(700, 10, 1),
                  letterSpacing: "2px",
                  color: dateInk,
                  textTransform: "uppercase",
                  opacity: 0.75,
                }}
              >
                {card.month}
              </div>
            </td>
            <td valign="middle" style={{ padding: "15px 17px" }}>
              <table {...TABLE_RESET} width="100%">
                <tbody>
                  <tr>
                    <td valign="top">
                      {meeting.kicker ? (
                        <div
                          className={tc(t.mute)}
                          style={{
                            ...ambient(700, 11, 1.4),
                            color: t.mute,
                            letterSpacing: "1px",
                            textTransform: "uppercase",
                            padding: "0 0 2px",
                          }}
                        >
                          {meeting.kicker}
                        </div>
                      ) : null}
                      <div
                        className={tc(t.ink)}
                        style={{
                          ...font(800, 18, 1.25, fonts.display),
                          color: t.ink,
                          letterSpacing: "-0.2px",
                          padding: "0 0 5px",
                        }}
                      >
                        {meeting.title}
                      </div>
                      <div
                        className={tc(t.mute)}
                        style={{
                          ...ambient(400, 13, 1.5),
                          color: t.mute,
                        }}
                      >
                        {card.time}{" "}
                        <span className={tc(t.dim)} style={{ color: t.dim }}>
                          ·
                        </span>{" "}
                        {card.loc}
                      </div>
                    </td>
                    <td
                      valign="top"
                      align="right"
                      width={56}
                      style={{ paddingLeft: "14px" }}
                    >
                      <EventArt
                        t={t}
                        ctx={ctx}
                        meeting={meeting}
                        kind={card.kind}
                        size={42}
                      />
                    </td>
                  </tr>
                  {/* The icon is as tall as the title and time, so the summary below runs the card's full width, then the buttons. */}
                  <tr>
                    <td colSpan={2}>
                      <div
                        className={tc(t.dim)}
                        style={{
                          ...ambient(400, 13, 1.55),
                          color: t.dim,
                          paddingTop: "7px",
                        }}
                      >
                        {meeting.summary}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ paddingTop: "12px" }}>
                      <ButtonRow
                        ctx={ctx}
                        secondary={{ label: "Details", url: page }}
                        primary={primary}
                        ground={t.cardFill}
                        quiet={{ line: t.quietLine, text: t.mute }}
                        loud={
                          t.name === "cosmic"
                            ? { fill: kt.date, line: kt.date, text: kt.dateInk }
                            : {
                                fill: t.cta.fill,
                                line: t.cta.border,
                                text: t.cta.text,
                              }
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </Frame>
  );
}

/** A hero card: the big version of an event, with its own button. */
function FeaturedCard({
  featured,
  ctx,
  t,
}: {
  featured: FeaturedEvent;
  ctx: RenderContext;
  t: Theme;
}) {
  const fonts = t.fonts(ctx.fonts);
  const { assets } = ctx;
  const { meeting } = featured;
  const card = eventCard(meeting, featured.kind);
  const kt = t.kinds[card.kind];
  const cosmic = t.name === "cosmic";
  return (
    <Frame
      t={t}
      line={cosmic ? kt.bar : t.cardLine}
      fill={cosmic ? t.cardFill : kt.fill}
      bw={t.tonightBw}
      depth={t.tonightDepth}
      shadow={kt.shadow}
      radius={t.radius.card}
      fillClass={cosmic ? glowClass(card.kind) : ""}
    >
      <table {...TABLE_RESET} width="100%">
        <tbody>
          <tr>
            <td style={{ padding: "22px 24px 24px" }}>
              <table {...TABLE_RESET} width="100%">
                <tbody>
                  <tr>
                    <td valign="top">
                      <div
                        className={tc(t.title)}
                        style={{
                          ...font(700, 28, 1.15, fonts.display),
                          color: t.title,
                          letterSpacing: "-0.4px",
                          padding: "0 0 10px",
                          ...(t.titleShadow
                            ? { textShadow: `3px 3px 0 ${kt.shadow}` }
                            : {}),
                        }}
                      >
                        {meeting.title}
                      </div>
                    </td>
                    <td
                      valign="top"
                      align="right"
                      width={cosmic ? 70 : 76}
                      style={{ paddingLeft: "16px" }}
                    >
                      <EventArt
                        t={t}
                        ctx={ctx}
                        meeting={meeting}
                        kind={card.kind}
                        size={cosmic ? 56 : 60}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              <table {...TABLE_RESET} style={{ margin: "2px 0 4px" }}>
                <tbody>
                  <tr>
                    <td
                      className={tc(t.ink)}
                      style={{
                        ...ambient(700, 14, 1.5),
                        color: t.ink,
                        paddingRight: "8px",
                      }}
                    >
                      {card.dow}, {card.month} {card.day}
                    </td>
                    <DividerCell color={t.sep} vertical />
                    <td
                      className={tc(cosmic ? t.ink : t.ink)}
                      style={{
                        ...ambient(400, 14, 1.5),
                        color: t.ink,
                        padding: "0 8px",
                      }}
                    >
                      {card.time}
                    </td>
                    <DividerCell color={t.sep} vertical />
                    <td
                      className={tc(t.ink)}
                      style={{
                        ...ambient(400, 14, 1.5),
                        color: t.ink,
                        padding: "0 8px",
                      }}
                    >
                      {card.loc}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                className={tc(t.mute)}
                style={{
                  ...ambient(400, 15, 1.6),
                  color: t.mute,
                  paddingTop: "10px",
                }}
              >
                {meeting.summary}
              </div>
              <div
                style={{
                  height: "18px",
                  lineHeight: "18px",
                  fontSize: "0px",
                }}
              >
                {" "}
              </div>
              {/* the card's action, right-justified */}
              <table {...TABLE_RESET} width="100%">
                <tbody>
                  <tr>
                    <td align="right" style={{ textAlign: "right" }}>
                      {"cta" in featured ? (
                        <CtaButton
                          ctx={ctx}
                          label={featured.cta}
                          url={meeting.rsvpUrl ?? `${SITE}/events`}
                          color={t.cta.fill}
                          textColor={t.cta.text}
                          borderColor={t.cta.border}
                          align="right"
                        />
                      ) : (
                        <a
                          href={PARTNERS[featured.partner].url}
                          style={{ textDecoration: "none" }}
                        >
                          <img
                            src={assets.partnerLogo(featured.partner)}
                            alt={PARTNERS[featured.partner].name}
                            width={partnerLogoSize(featured.partner).width}
                            height={partnerLogoSize(featured.partner).height}
                            style={{
                              display: "inline-block",
                              verticalAlign: "middle",
                              border: 0,
                              outline: "none",
                            }}
                          />
                        </a>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </Frame>
  );
}

function SectionHeading({
  children,
  color,
  fonts,
  paddingBottom = 14,
}: {
  children: ReactNode;
  color: string;
  fonts: FontStacks;
  paddingBottom?: number;
}) {
  return (
    <div
      className={tc(color)}
      style={{
        ...font(700, 13, 1, fonts.mono),
        color,
        padding: `0 0 ${paddingBottom}px`,
      }}
    >
      ## {children}
    </div>
  );
}

/** One quiet bottom card — the shared frame under "new here?" and "sign-off". */
function QuietCard({
  t,
  fill,
  children,
}: {
  t: Theme;
  fill: string;
  children: ReactNode;
}) {
  return (
    <Frame
      t={t}
      line={t.cardLine}
      fill={fill}
      bw={t.cardBw}
      depth={t.cardDepth}
      radius={t.radius.card}
    >
      <table {...TABLE_RESET} width="100%">
        <tbody>
          <tr>
            <td style={{ padding: "18px 20px" }}>{children}</td>
          </tr>
        </tbody>
      </table>
    </Frame>
  );
}

/** The DevDogs logo for the active theme: the on-dark lockup (Cosmic) or the light/dark pair (Paper). */
function DevDogsMark({ t, ctx }: { t: Theme; ctx: RenderContext }) {
  const { width, height } = MARK_SIZES.devdogsLockup;
  if (t.name === "cosmic") {
    return (
      <img
        src={ctx.assets.devdogsLockup}
        width={width}
        height={height}
        alt="DevDogs"
        style={{ display: "block" }}
      />
    );
  }
  return (
    <ThemeImgPair
      ctx={ctx}
      light="paper-devdogs-logo"
      dark="paper-devdogs-logo-dark"
      width={Math.round((height * 264) / 71)}
      height={height}
      alt="DevDogs"
    />
  );
}

/**
 * The complete issue, from the terminal title bar to the footer lockups —
 * everything inside (and including) the 600px shell.
 */
export function ChangelogEmail({
  issue,
  ctx,
}: {
  issue: ChangelogIssue;
  ctx: RenderContext;
}) {
  if (issue.campaign) return <CampaignEmail issue={issue} ctx={ctx} />;
  const { assets } = ctx;
  const t = themeOf(issue);
  const fonts = t.fonts(ctx.fonts);
  const cosmic = t.name === "cosmic";
  const headingColor = cosmic
    ? t.kinds[eventCard(issue.featured[0].meeting, issue.featured[0].kind).kind]
        .bar
    : t.link;
  const arrowLinkStyle: CSSProperties = {
    color: t.ink,
    textDecoration: "none",
  };
  const mirrorPath = cosmic
    ? `changelog/${issue.version}`
    : `newsletters/gdgc/${issue.version}`;
  const dotGrid = t.barTexture ? ` ${DOT_GRID_CLASS}` : "";

  return (
    <Frame
      t={t}
      line={t.windowLine}
      fill={t.windowFill}
      bw={t.windowBw}
      depth={t.windowDepth}
      radius={t.radius.window}
      width={WIDTH}
    >
      {cosmic ? null : <style>{CAMPAIGN_FONT_CSS + PAPER_MONO_CSS}</style>}
      <table {...TABLE_RESET} width="100%">
        <tbody>
          {/* terminal title bar */}
          <tr>
            <td
              {...bgAttr(t.bar)}
              className={`${bc(t.bar)}${dotGrid}`}
              style={{
                padding: "12px 18px",
              }}
            >
              <table {...TABLE_RESET} width="100%">
                <tbody>
                  <tr>
                    <td width={96}>
                      <TitleDots t={t} ctx={ctx} />
                    </td>
                    <td
                      align="center"
                      className={tc(t.dim)}
                      style={{
                        ...font(600, 12, 1, fonts.mono),
                        color: t.dim,
                      }}
                    >
                      {t.terminal} ~{" "}
                      <span
                        className={tc(t.termAccent)}
                        style={{ color: t.termAccent }}
                      >
                        changelog
                      </span>{" "}
                      ~ 80×24
                    </td>
                    <td
                      width={96}
                      align="right"
                      className={tc(t.dim)}
                      style={{
                        ...font(600, 12, 1, fonts.mono),
                        color: t.dim,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {issue.sendLabel}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <tr>
            <DividerCell color={t.rule} size={t.ruleH} />
          </tr>

          {/* masthead: the DevDogs lockup and "Changelog_" on one shared line */}
          <tr>
            <td style={{ padding: "24px 22px 4px" }}>
              <table {...TABLE_RESET} width="100%">
                <tbody>
                  <tr>
                    <td valign="middle">
                      <table {...TABLE_RESET}>
                        <tbody>
                          <tr>
                            <td valign="middle">
                              <DevDogsMark t={t} ctx={ctx} />
                            </td>
                            <td
                              valign="bottom"
                              style={{ padding: "0 0 5px 8px" }}
                            >
                              <span
                                className={tc(t.accent)}
                                style={{
                                  ...font(700, 22, 1, fonts.mono),
                                  letterSpacing: "-0.4px",
                                  color: t.accent,
                                }}
                              >
                                Changelog_
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                    <td valign="middle" align="right">
                      <div
                        className={tc(t.version)}
                        style={{
                          ...font(800, 12, 1, fonts.mono),
                          color: t.version,
                        }}
                      >
                        v{issue.version}
                      </div>
                      <div
                        className={tc(t.mute)}
                        style={{
                          ...font(600, 12, 1, fonts.mono),
                          color: t.mute,
                          paddingTop: "5px",
                        }}
                      >
                        {issue.term}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table {...TABLE_RESET} width="100%">
                <tbody>
                  <tr>
                    <td valign="top">
                      <div
                        className={tc(t.mute)}
                        style={{
                          ...font(400, 13, 1.6, fonts.mono),
                          color: t.mute,
                          paddingTop: "16px",
                        }}
                      >
                        <span
                          className={tc(t.accent)}
                          style={{ color: t.accent, fontWeight: 700 }}
                        >
                          $
                        </span>{" "}
                        <span
                          className={tc(t.accent)}
                          style={{ color: t.accent }}
                        >
                          changelog
                        </span>{" "}
                        <span className={tc(t.ink)} style={{ color: t.ink }}>
                          {issue.command.replace(/^(changelog|gdgc)\s*/, "")}
                        </span>
                      </div>
                      {/* The "view in browser" escape hatch, in the terminal
                          costume: the command's output points at the archive
                          page rendering this same tree, phrased as the curl
                          that would fetch it. */}
                      <div
                        className={tc(t.dim)}
                        style={{
                          ...font(400, 13, 1.6, fonts.mono),
                          color: t.dim,
                          paddingTop: "3px",
                        }}
                      >
                        → mirror:{" "}
                        <a
                          href={`${SITE}/${mirrorPath}`}
                          className={tc(t.link)}
                          style={{ color: t.link, textDecoration: "none" }}
                        >
                          curl devdogsuga.org/{mirrorPath}
                        </a>
                      </div>
                    </td>
                    {cosmic ? null : (
                      <td valign="middle" align="right" width={40}>
                        {/* Paper's one asterisk, as decoration */}
                        <ThemeImg
                          ctx={ctx}
                          name="paper-asterisk"
                          width={26}
                          height={26}
                          style={{ marginLeft: "auto" }}
                        />
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          {/* the stripe: Cosmic's pixel-art space strip over pixel stairs;
              Paper's Google four-color bar. Cosmic's cells carry the colors
              the images paint, so blocked images leave a solid band. */}
          <tr>
            <td style={{ padding: "14px 22px 0" }}>
              {cosmic ? (
                <table {...TABLE_RESET} width="100%">
                  <tbody>
                    <tr>
                      <td
                        {...bgAttr(COSMIC_SKY)}
                        className={bc(COSMIC_SKY)}
                        height={64}
                        style={{ height: "64px", lineHeight: 0, fontSize: 0 }}
                      >
                        <ThemeImg
                          ctx={ctx}
                          name="cosmic-strip"
                          width={556}
                          height={64}
                          style={{
                            ...PIXELATED,
                            width: "100%",
                            height: "auto",
                          }}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td
                        {...bgAttr(UGA)}
                        className={bc(UGA)}
                        height={10}
                        style={{ height: "10px", lineHeight: 0, fontSize: 0 }}
                      >
                        <ThemeImg
                          ctx={ctx}
                          name="cosmic-stairs"
                          width={556}
                          height={10}
                          style={{
                            ...PIXELATED,
                            width: "100%",
                            height: "auto",
                          }}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <table
                  {...TABLE_RESET}
                  width="100%"
                  className={brc(t.ink)}
                  style={{
                    border: `2px solid ${t.ink}`,
                    borderRadius: "99px",
                    borderCollapse: "separate",
                    overflow: "hidden",
                  }}
                >
                  <tbody>
                    <tr>
                      {[
                        PAPER.googleBlue,
                        PAPER.googleRed,
                        PAPER.googleYellow,
                        PAPER.googleGreen,
                      ].map((color) => (
                        <td
                          key={color}
                          {...bgAttr(color)}
                          className={bc(color)}
                          width="25%"
                          height={10}
                          style={{
                            height: "10px",
                            fontSize: "0px",
                            lineHeight: 0,
                          }}
                        >
                          {" "}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              )}
            </td>
          </tr>

          {/* intro */}
          <tr>
            <td style={{ padding: "20px 22px 6px", fontFamily: fonts.sans }}>
              <div
                className={tc(t.title)}
                style={{
                  ...font(800, 24, 1.25, fonts.display),
                  color: t.title,
                  letterSpacing: "-0.3px",
                }}
              >
                {issue.tagline}
              </div>
              <div
                className={tc(t.mute)}
                style={{
                  ...ambient(400, 15, 1.6),
                  color: t.mute,
                  paddingTop: "11px",
                }}
              >
                {issue.intro}
              </div>
            </td>
          </tr>

          {/* featured / hero event */}
          <tr>
            <td style={{ padding: "20px 22px 6px", fontFamily: fonts.sans }}>
              <SectionHeading color={headingColor} fonts={fonts}>
                {issue.featuredLabel}
              </SectionHeading>
              {issue.featured.map((featured, index) => (
                <Fragment key={featured.meeting.slug}>
                  {index > 0 ? (
                    <div
                      style={{
                        height: "20px",
                        lineHeight: "20px",
                        fontSize: "0px",
                      }}
                    >
                      {" "}
                    </div>
                  ) : null}
                  <FeaturedCard featured={featured} ctx={ctx} t={t} />
                </Fragment>
              ))}
            </td>
          </tr>

          {/* upcoming events */}
          <tr>
            <td style={{ padding: "22px 22px 0", fontFamily: fonts.sans }}>
              <SectionHeading color={t.ink} fonts={fonts}>
                upcoming
              </SectionHeading>
              {issue.upcoming.map((meeting) => (
                <EventRow
                  key={meeting.slug}
                  meeting={meeting}
                  ctx={ctx}
                  t={t}
                />
              ))}
              <div style={{ padding: "2px 0 4px", textAlign: "center" }}>
                <a
                  href={`${SITE}/events`}
                  className={tc(t.link)}
                  style={{
                    ...font(700, 13, 1, fonts.mono),
                    color: t.link,
                    textDecoration: "none",
                  }}
                >
                  → full calendar &amp; subscribe (.ics)
                </a>
              </div>
            </td>
          </tr>

          {/* new here? */}
          <tr>
            <td style={{ padding: "18px 22px 0", fontFamily: fonts.sans }}>
              <QuietCard t={t} fill={t.newHereFill}>
                <SectionHeading
                  color={t.newHereLabel}
                  fonts={fonts}
                  paddingBottom={11}
                >
                  new here?
                </SectionHeading>
                <div
                  className={tc(t.mute)}
                  style={{
                    ...ambient(400, 14, 1.6),
                    color: t.mute,
                    paddingBottom: "12px",
                  }}
                >
                  No experience required, ever. Bring a laptop if you've got
                  one, curiosity if you don't. Start here:
                </div>
                <div
                  className={tc(t.ink)}
                  style={{ ...font(600, 14, 2, fonts.mono), color: t.ink }}
                >
                  <a
                    href="https://discord.gg/devdogs"
                    className={tc(t.ink)}
                    style={arrowLinkStyle}
                  >
                    <span
                      className={tc(t.arrows[0])}
                      style={{ color: t.arrows[0] }}
                    >
                      →
                    </span>{" "}
                    join the Discord
                  </a>
                  <br />
                  <a
                    href={`${SITE}/events`}
                    className={tc(t.ink)}
                    style={arrowLinkStyle}
                  >
                    <span
                      className={tc(t.arrows[1])}
                      style={{ color: t.arrows[1] }}
                    >
                      →
                    </span>{" "}
                    add our events to your calendar
                  </a>
                  <br />
                  <a
                    href="https://github.com/devdogsuga"
                    className={tc(t.ink)}
                    style={arrowLinkStyle}
                  >
                    <span
                      className={tc(t.arrows[2])}
                      style={{ color: t.arrows[2] }}
                    >
                      →
                    </span>{" "}
                    browse what members are building
                  </a>
                </div>
              </QuietCard>
            </td>
          </tr>

          {/* sign-off */}
          <tr>
            {/* 24px below the last card, mirroring the 24px above the masthead,
                so the content column meets both bar dividers evenly. */}
            <td style={{ padding: "18px 22px 24px", fontFamily: fonts.sans }}>
              <QuietCard t={t} fill={t.signoffFill}>
                <SectionHeading
                  color={t.signoffLabel}
                  fonts={fonts}
                  paddingBottom={11}
                >
                  sign-off
                </SectionHeading>
                <div
                  className={tc(t.mute)}
                  style={{
                    ...ambient(400, 14, 1.6),
                    color: t.mute,
                  }}
                >
                  {issue.signoff}
                  <div
                    className={tc(t.dim)}
                    style={{
                      color: t.dim,
                      fontSize: "13px",
                      textAlign: "right",
                      paddingTop: "4px",
                    }}
                  >
                    {t.signature}
                  </div>
                </div>
              </QuietCard>
            </td>
          </tr>

          <tr>
            <DividerCell color={t.rule} size={t.ruleH} />
          </tr>

          {/* footer: both lockups on one centered line, then the socials.
              No unsubscribe — this goes out over the University listserv.
              Paper leads with the official GDG on Campus lockup. */}
          <tr>
            <td
              align="center"
              {...bgAttr(t.bar)}
              className={`${bc(t.bar)}${dotGrid}`}
              style={{
                padding: "28px 22px 30px",
              }}
            >
              <table {...TABLE_RESET} style={{ margin: "0 auto" }}>
                <tbody>
                  <tr>
                    {cosmic ? (
                      <>
                        <td
                          align="center"
                          valign="top"
                          style={{ padding: "0 20px" }}
                        >
                          <DevDogsMark t={t} ctx={ctx} />
                        </td>
                        {/* 7px down so the GDG wordmark's baseline sits on the
                            DevDogs wordmark's, with "On Campus · UGA" hanging
                            as a subtitle. */}
                        <td
                          align="center"
                          valign="top"
                          style={{ padding: "7px 20px 0" }}
                        >
                          <img
                            src={assets.gdgcLockup}
                            width={MARK_SIZES.gdgcLockup.width}
                            height={MARK_SIZES.gdgcLockup.height}
                            alt="Google Developer Groups On Campus · University of Georgia"
                            style={{ display: "block" }}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          align="center"
                          valign="middle"
                          style={{ padding: "0 20px" }}
                        >
                          <ThemeImgPair
                            ctx={ctx}
                            light="paper-gdgc-lockup"
                            dark="paper-gdgc-lockup-dark"
                            width={236}
                            height={30}
                            alt="Google Developer Groups On Campus · University of Georgia"
                          />
                        </td>
                        <td
                          align="center"
                          valign="middle"
                          style={{ padding: "0 20px" }}
                        >
                          <DevDogsMark t={t} ctx={ctx} />
                        </td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
              <table {...TABLE_RESET} style={{ margin: "20px auto 0" }}>
                <tbody>
                  <tr>
                    {SOCIAL_LINKS.map((social) => (
                      <td
                        key={social.label}
                        align="center"
                        valign="middle"
                        style={{ padding: "0 10px", whiteSpace: "nowrap" }}
                      >
                        <a
                          href={social.url}
                          className={tc(t.ink)}
                          style={{
                            ...font(600, 13, "17px", fonts.mono),
                            color: t.ink,
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {cosmic ? (
                            <>
                              <img
                                src={assets.socialIcon(social.icon)}
                                width={MARK_SIZES.socialIcon.width}
                                height={MARK_SIZES.socialIcon.height}
                                alt=""
                                style={{
                                  display: "inline-block",
                                  verticalAlign: "middle",
                                  border: 0,
                                  outline: "none",
                                }}
                              />{" "}
                            </>
                          ) : null}
                          <span className={tc(t.ink)} style={{ color: t.ink }}>
                            {social.label}
                          </span>
                        </a>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <div
                className={tc(t.dim)}
                style={{
                  ...font(400, 12, 1.7, fonts.mono),
                  color: t.dim,
                  paddingTop: "16px",
                }}
              >
                {/* A deliberate two-line stack: left to wrap on its own, the
                    line broke with "Campus" orphaned. */}
                {cosmic ? (
                  <>
                    DevDogs at the University of Georgia
                    <br />
                    Google Developer Group on Campus
                  </>
                ) : (
                  <>
                    Google Developer Group on Campus
                    <br />
                    DevDogs at the University of Georgia
                  </>
                )}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </Frame>
  );
}

/** Google Sans Mono for Paper's terminal voice: hosted beside the Google Sans files, with no embedded copy. */
const PAPER_MONO_CSS = [400, 700]
  .map(
    (weight) =>
      `@font-face{font-family:'Google Sans Mono';font-style:normal;font-weight:${weight};src:local('Google Sans Mono'),url('https://devdogsuga.org/brand/newsletter/GoogleSansMono-${weight === 400 ? "Regular" : "Bold"}.ttf') format('truetype')}`,
  )
  .join("");

/**
 * The full mail document around `ChangelogEmail`: head metas, the Google Fonts
 * link (honored by Apple/iOS Mail, ignored by Gmail and Outlook, which fall
 * down the literal stacks), the hidden inbox-preview line, and the centered
 * canvas. Only the exporter renders this; the platform pages already have a
 * document of their own.
 */
export function ChangelogDocument({
  issue,
  ctx,
}: {
  issue: ChangelogIssue;
  ctx: RenderContext;
}) {
  const t = themeOf(issue);
  // Campaign and Paper are light-native: both ship a dark twin to the web
  // Outlooks instead of pinning themselves light.
  const light = !!issue.campaign || t.name === "paper";
  const selected = issue.campaign ? "none" : t.name;
  const cosmicChangelog = !issue.campaign && t.name === "cosmic";
  // The campaign layout paints its own panels; its canvas stays Cosmic's.
  const ground = issue.campaign ? PALETTE.bg : t.ground;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="x-apple-disable-message-reformatting" />
        {/* "light dark" is deliberate although the design never changes: it
            says "this email handles both schemes itself", which is what stops
            scheme-aware clients from recoloring it. */}
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <title>{issue.title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link href={FONTS_HREF} rel="stylesheet" />
        <style
          dangerouslySetInnerHTML={{
            __html: cosmicChangelog
              ? `@import url('${FONTS_HREF}');${CHANGELOG_FONT_CSS}`
              : "",
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `${paintCss({ campaign: light, theme: selected, themeImage: ctx.assets.themeImage })}\n${darkModeCss({ campaign: light, theme: selected })}`,
          }}
        />
      </head>
      {/* The body carries the document's ONE inline background, on purpose:
          the web Outlooks' dark mode repaints inline backgrounds in place and
          stamps `data-ogsb` on the element it repainted — and an ancestor
          with that attribute is what switches on every scoped pin in
          darkModeCss(). The repainted body itself is fully covered by the
          pinned full-width table below, so the sacrifice never shows. */}
      <body
        className={bc(ground)}
        {...bgAttr(ground)}
        style={{ margin: 0, padding: 0, ...solidBg(ground) }}
      >
        <div
          style={{
            display: "none",
            maxHeight: 0,
            overflow: "hidden",
            opacity: 0,
          }}
        >
          {issue.preview}
        </div>
        <table
          {...TABLE_RESET}
          width="100%"
          bgcolor={ground}
          className={bc(ground)}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: "24px 12px" }}>
                <ChangelogEmail issue={issue} ctx={ctx} />
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
